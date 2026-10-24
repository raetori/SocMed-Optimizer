// Runs every preset through native ffmpeg on synthetic test clips and checks the
// output against each platform's ingest spec. Needs ffmpeg and ffprobe on PATH.
//   node scripts/verify-presets.ts

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseProbe, type ProbeJson } from '../src/lib/probe.ts'
import {
  buildFfmpegArgs,
  DEFAULT_OPTIONS,
  PLATFORMS,
  targetFrameRate,
  type EncodeOptions,
} from '../src/lib/presets.ts'

const dir = mkdtempSync(join(tmpdir(), 'presets-'))
const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).toString()

const probe = (file: string): ProbeJson =>
  JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]))

interface Clip {
  name: string
  args: string[]
  rotate?: number
}

const clips: Clip[] = [
  {
    name: 'sdr_4k60_landscape_audio.mp4',
    args: ['-f', 'lavfi', '-i', 'testsrc2=size=3840x2160:rate=60:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'],
  },
  {
    name: 'hlg_10bit_vertical.mov',
    args: ['-f', 'lavfi', '-i', 'testsrc2=size=2160x3840:rate=30:duration=2',
      '-vf', 'format=yuv420p10le,setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc', '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error',
      '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc', '-tag:v', 'hvc1'],
  },
  {
    name: 'sdr_120fps.mov',
    args: ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=120:duration=1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'],
  },
  {
    name: 'sdr_phone_portrait_rotated.mov',
    args: ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'],
    rotate: 90,
  },
  {
    name: 'sdr_15fps_fullrange_small.mp4',
    args: ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=15:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuvj420p'],
  },
]

// Walks top-level MP4 boxes: Meta requires the moov atom ahead of the media data.
function moovBeforeMdat(file: string): boolean {
  const buf = readFileSync(file)
  let off = 0
  while (off + 8 <= buf.length) {
    let size = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    if (type === 'moov') return true
    if (type === 'mdat') return false
    if (size === 1) size = Number(buf.readBigUInt64BE(off + 8))
    if (size < 8) return false
    off += size
  }
  return false
}

let failures = 0
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failures++
    console.log(`    FAIL ${msg}`)
  }
}

try {
  for (const clip of clips) {
    const input = join(dir, clip.name)
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...clip.args, input])
    if (clip.rotate) {
      // Phones store portrait video as landscape pixels plus a rotation flag.
      const raw = join(dir, `raw_${clip.name}`)
      run('mv', [input, raw])
      run('ffmpeg', ['-loglevel', 'error', '-y', '-display_rotation', String(clip.rotate), '-i', raw, '-c', 'copy', input])
    }
    const src = parseProbe(probe(input))
    console.log(`${clip.name}: ${src.width}x${src.height} ${src.frameRate.num}/${src.frameRate.den} hdr=${src.hdr} audio=${src.hasAudio}`)

    for (const platform of PLATFORMS) {
      for (const fit of ['fit', 'fill'] as const) {
        const opts: EncodeOptions = { ...DEFAULT_OPTIONS, platform: platform.id, fit, speed: 'fast', deband: true }
        const output = join(dir, `out_${platform.id}_${fit}.mp4`)
        run('ffmpeg', ['-loglevel', 'error', ...buildFfmpegArgs(src, opts, input, output)])
        const out = probe(output)
        const v = out.streams!.find((s) => s.codec_type === 'video')!
        const a = out.streams!.find((s) => s.codec_type === 'audio')
        const want = targetFrameRate(src.frameRate)
        const label = `  ${platform.id}/${fit}`
        check(v.codec_name === 'h264', `${label} codec ${v.codec_name}`)
        check(v.width === platform.width && v.height === platform.height, `${label} size ${v.width}x${v.height}`)
        check(v.pix_fmt === 'yuv420p', `${label} pix_fmt ${v.pix_fmt}`)
        check(v.color_transfer === 'bt709' && v.color_primaries === 'bt709', `${label} color ${v.color_primaries}/${v.color_transfer}`)
        check(v.avg_frame_rate === `${want.num}/${want.den}`, `${label} fps ${v.avg_frame_rate}`)
        check(src.hasAudio ? a?.codec_name === 'aac' && a.sample_rate === '48000' : !a, `${label} audio`)
        check(statSync(output).size < platform.maxBytes, `${label} size limit`)
        check(moovBeforeMdat(output), `${label} moov atom not first (faststart)`)
        console.log(`${label}: ok ${v.width}x${v.height} ${v.avg_frame_rate} ${(statSync(output).size / 1024).toFixed(0)} KB`)
      }
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failures) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll presets passed.')
