// Thin wrapper around ffmpeg.wasm. The video never leaves the browser: the input
// File is mounted read-only (WORKERFS, no copy into wasm memory) and the output
// is read back from the in-memory filesystem.

import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import { parseProbe, type ProbeJson, type SourceInfo } from './probe'
import { buildFfmpegArgs, type EncodeOptions } from './presets'

const CORE_VERSION = '0.12.10'
// The core wasm is ~32 MB, above Cloudflare Pages' 25 MiB per-file limit, so it
// loads from a CDN by default. Set VITE_FFMPEG_CORE_BASE to self-host it.
const CORE_BASE: string = import.meta.env.VITE_FFMPEG_CORE_BASE ?? 'https://cdn.jsdelivr.net/npm'

const IN_DIR = '/in'
const OUT_FILE = '/out.mp4'

export type EngineMode = 'multi-thread' | 'single-thread'

export class Engine {
  private ffmpeg: FFmpeg | null = null
  private loading: Promise<void> | null = null
  mode: EngineMode = 'single-thread'
  /** Set after the multi-threaded core fails once; everything after runs single-threaded. */
  private forceSingleThread = import.meta.env.VITE_FFMPEG_SINGLE_THREAD === '1'
  private logListener: ((line: string) => void) | null = null
  private progressListener: ((timeMicros: number) => void) | null = null
  private cancelled = false

  load(): Promise<void> {
    this.loading ??= this.doLoad().catch((e) => {
      this.loading = null
      throw e
    })
    return this.loading
  }

  private async doLoad() {
    const ffmpeg = new FFmpeg()
    ffmpeg.on('log', ({ message }) => this.logListener?.(message))
    ffmpeg.on('progress', ({ time }) => this.progressListener?.(time))
    // The multi-threaded core needs SharedArrayBuffer, which needs cross-origin isolation.
    const mt = globalThis.crossOriginIsolated === true && !this.forceSingleThread
    const pkg = mt ? 'core-mt' : 'core'
    const base = `${CORE_BASE}/@ffmpeg/${pkg}@${CORE_VERSION}/dist/esm`
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      ...(mt ? { workerURL: await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript') } : {}),
    })
    await ffmpeg.createDir(IN_DIR)
    this.mode = mt ? 'multi-thread' : 'single-thread'
    this.ffmpeg = ffmpeg
  }

  private async withInput<T>(file: File, fn: (ffmpeg: FFmpeg, path: string) => Promise<T>): Promise<T> {
    await this.load()
    const ffmpeg = this.ffmpeg!
    await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, IN_DIR)
    try {
      return await fn(ffmpeg, `${IN_DIR}/${file.name}`)
    } finally {
      await ffmpeg.unmount(IN_DIR).catch(() => {})
    }
  }

  probe(file: File): Promise<SourceInfo> {
    return this.withInput(file, async (ffmpeg, path) => {
      const out = '/probe.json'
      await ffmpeg.ffprobe([
        '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path, '-o', out,
      ])
      const text = (await ffmpeg.readFile(out, 'utf8')) as string
      await ffmpeg.deleteFile(out).catch(() => {})
      let json: ProbeJson
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error('This file could not be read as a video.')
      }
      return parseProbe(json)
    })
  }

  /**
   * Encodes the file. Progress is derived from ffmpeg's "time=" log lines, which
   * is more reliable than the core's own progress event for filtered output.
   */
  async encode(
    file: File,
    src: SourceInfo,
    opts: EncodeOptions,
    onProgress: (fraction: number, speed: number | null) => void,
  ): Promise<Blob> {
    await this.load()
    if (this.mode === 'single-thread') return this.encodeOnce(file, src, opts, onProgress)
    try {
      return await this.encodeOnce(file, src, opts, onProgress)
    } catch (e) {
      if (this.cancelled) throw e
      // The multi-threaded core still crashes on some devices. Retry once on the
      // slower but sturdier single-threaded core.
      console.warn('Multi-threaded encode failed, retrying single-threaded', e)
      this.cancel()
      this.cancelled = false
      this.forceSingleThread = true
      onProgress(0, null)
      return this.encodeOnce(file, src, opts, onProgress)
    }
  }

  /**
   * ffmpeg's "time=" stats lines end in a carriage return, so the wasm logger
   * only flushes them when the encode ends. Progress comes from the core's own
   * progress event instead, which reports encoded time in microseconds.
   */
  private encodeOnce(
    file: File,
    src: SourceInfo,
    opts: EncodeOptions,
    onProgress: (fraction: number, speed: number | null) => void,
  ): Promise<Blob> {
    this.cancelled = false
    return this.withInput(file, async (ffmpeg, path) => {
      const tail: string[] = []
      this.logListener = (line) => {
        tail.push(line)
        if (tail.length > 30) tail.shift()
      }
      const startedAt = performance.now()
      this.progressListener = (timeMicros) => {
        const sec = timeMicros / 1e6
        if (!(sec > 0) || src.durationSec <= 0) return
        const wall = (performance.now() - startedAt) / 1000
        onProgress(Math.min(1, sec / src.durationSec), wall > 0 ? sec / wall : null)
      }
      try {
        const args = buildFfmpegArgs(src, opts, path, OUT_FILE)
        if (this.mode === 'multi-thread') {
          // Auto thread count crashes the wasm pthread pool on many-core machines;
          // 2 to 4 encoder threads with a single filter thread was fastest in testing.
          const threads = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 2) - 1))
          args.splice(args.indexOf('-y'), 0, '-threads', String(threads), '-filter_threads', '1')
        }
        const code = await ffmpeg.exec(args)
        if (code !== 0) {
          throw new Error(`Encoding failed (ffmpeg exited with ${code}).\n${tail.slice(-8).join('\n')}`)
        }
        const data = (await ffmpeg.readFile(OUT_FILE)) as Uint8Array
        await ffmpeg.deleteFile(OUT_FILE).catch(() => {})
        onProgress(1, null)
        return new Blob([data as BlobPart], { type: 'video/mp4' })
      } finally {
        this.logListener = null
        this.progressListener = null
      }
    })
  }

  /** Stops a running encode. The worker is killed, so the next call reloads the core. */
  cancel() {
    this.cancelled = true
    this.ffmpeg?.terminate()
    this.ffmpeg = null
    this.loading = null
  }
}
