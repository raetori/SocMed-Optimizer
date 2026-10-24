import { useCallback, useEffect, useRef, useState } from 'react'
import { Engine } from './lib/engine'
import type { SourceInfo } from './lib/probe'
import {
  DEFAULT_OPTIONS,
  PLATFORMS,
  getPlatform,
  outputFileName,
  targetFrameRate,
  type EncodeOptions,
  type FitMode,
  type PlatformId,
  type Speed,
} from './lib/presets'
import { CosmosMark } from './CosmosMark'
import { formatBytes, formatDuration, formatFps } from './lib/format'

const MAX_BYTES = 500 * 1024 * 1024
const MAX_SECONDS = 180
const BRAND_URL = 'https://creationofcosmos.com/'

type Settings = Omit<EncodeOptions, 'platform'>

interface Result {
  platform: PlatformId
  blob: Blob
  url: string
  name: string
}

type Job =
  | { state: 'idle' }
  | { state: 'running'; platform: PlatformId; index: number; total: number; fraction: number; speed: number | null; startedAt: number }
  | { state: 'done' }
  | { state: 'error'; message: string }

const engine = new Engine()

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState<SourceInfo | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const [engineState, setEngineState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selected, setSelected] = useState<PlatformId[]>(['tiktok'])
  const [settings, setSettings] = useState<Settings>(DEFAULT_OPTIONS)
  const [job, setJob] = useState<Job>({ state: 'idle' })
  const [results, setResults] = useState<Result[]>([])
  const cancelled = useRef(false)

  // Start fetching the engine early so it's warm by the time a file is chosen.
  useEffect(() => {
    setEngineState('loading')
    engine.load().then(
      () => setEngineState('ready'),
      () => setEngineState('error'),
    )
  }, [])

  const clearResults = useCallback(() => {
    setResults((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.url))
      return []
    })
  }, [])

  const chooseFile = useCallback(
    async (f: File) => {
      clearResults()
      setJob({ state: 'idle' })
      setFile(f)
      setSource(null)
      setFileError(null)
      if (f.size > MAX_BYTES) {
        setFileError(`This file is ${formatBytes(f.size)}. The limit is 500 MB for now, because the encoding runs in your browser’s memory.`)
        return
      }
      setProbing(true)
      try {
        const info = await engine.probe(f)
        setEngineState('ready')
        if (info.durationSec > MAX_SECONDS + 0.5) {
          setFileError(`This video is ${formatDuration(info.durationSec)} long. The limit is 3 minutes for now.`)
          return
        }
        setSource(info)
        setSettings((s) => ({ ...s, toneMap: info.hdr !== null }))
      } catch (e) {
        setFileError(e instanceof Error ? e.message : 'This file could not be read as a video.')
      } finally {
        setProbing(false)
      }
    },
    [clearResults],
  )

  const start = async () => {
    if (!file || !source || selected.length === 0) return
    clearResults()
    cancelled.current = false
    const order = PLATFORMS.map((p) => p.id).filter((id) => selected.includes(id))
    try {
      for (let i = 0; i < order.length; i++) {
        const platform = order[i]
        setJob({ state: 'running', platform, index: i, total: order.length, fraction: 0, speed: null, startedAt: Date.now() })
        const blob = await engine.encode(file, source, { ...settings, platform }, (fraction, speed) =>
          setJob((j) => (j.state === 'running' ? { ...j, fraction, speed: speed ?? j.speed } : j)),
        )
        if (cancelled.current) return
        const result = { platform, blob, url: URL.createObjectURL(blob), name: outputFileName(file.name, platform) }
        setResults((prev) => [...prev, result])
      }
      setJob({ state: 'done' })
    } catch (e) {
      if (cancelled.current) return
      setJob({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const cancel = () => {
    cancelled.current = true
    engine.cancel()
    setJob({ state: 'idle' })
    setEngineState('loading')
    engine.load().then(
      () => setEngineState('ready'),
      () => setEngineState('error'),
    )
  }

  const running = job.state === 'running'

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="./" aria-label="Nova home">
          <CosmosMark className="brand-mark" />
          <span className="brand-name">Nova</span>
        </a>
        <a className="byline" href={BRAND_URL} target="_blank" rel="noreferrer">
          by Creation of Cosmos
        </a>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Video optimizer for TikTok, Instagram and Facebook</p>
          <h1>Post video that still looks like your export.</h1>
          <p className="lede">
            Every platform re-encodes what you upload. Nova hands them a file built to their exact
            ingest spec, so their compression does as little damage as possible. It all runs in your
            browser. Your video never leaves your device.
          </p>
        </section>

        <section className="panel" aria-labelledby="step-1">
          <StepTitle n={1} id="step-1">Choose a video</StepTitle>
          <DropZone onFile={chooseFile} disabled={running} file={file} />
          {probing && <p className="muted">Reading the video…</p>}
          {fileError && <p className="alert">{fileError}</p>}
          {source && file && <SourceSummary source={source} file={file} />}
        </section>

        <section className={`panel ${source ? '' : 'is-disabled'}`} aria-labelledby="step-2">
          <StepTitle n={2} id="step-2">Pick where it’s going</StepTitle>
          <div className="platforms" role="group" aria-label="Platforms">
            {PLATFORMS.map((p) => {
              const on = selected.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`platform ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  disabled={running}
                  onClick={() =>
                    setSelected((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))
                  }
                >
                  <span className="platform-name">{p.label}</span>
                  <span className="platform-format">{p.format}</span>
                </button>
              )
            })}
          </div>

          <div className="settings">
            <Segmented<FitMode>
              label="Framing"
              value={settings.fit}
              disabled={running}
              onChange={(fit) => setSettings({ ...settings, fit })}
              options={[
                { value: 'fit', label: 'Fit', hint: 'Whole frame, with bars if the shape differs' },
                { value: 'fill', label: 'Fill', hint: 'Fill the screen, cropping the edges' },
              ]}
            />
            <Segmented<Speed>
              label="Encode speed"
              value={settings.speed}
              disabled={running}
              onChange={(speed) => setSettings({ ...settings, speed })}
              options={[
                { value: 'fast', label: 'Fast', hint: 'Quickest, slightly larger file' },
                { value: 'balanced', label: 'Balanced', hint: 'Good default' },
                { value: 'best', label: 'Best', hint: 'Slowest, most efficient' },
              ]}
            />
          </div>

          <fieldset className="toggles" disabled={running}>
            <legend>Clean-up</legend>
            {source?.hdr && (
              <Toggle
                checked={settings.toneMap}
                onChange={(toneMap) => setSettings({ ...settings, toneMap })}
                title="Convert HDR to SDR"
                hint="iPhone HDR often looks washed out or blown out once posted. This converts it with the same tone-mapper Meta uses."
              />
            )}
            {source?.hdr && settings.toneMap && (
              <label className="slider">
                <span>
                  HDR brightness <span className="muted">({settings.hdrPeak} nits peak, lower is brighter)</span>
                </span>
                <input
                  type="range"
                  min={100}
                  max={203}
                  step={1}
                  value={settings.hdrPeak}
                  onChange={(e) => setSettings({ ...settings, hdrPeak: Number(e.target.value) })}
                />
              </label>
            )}
            <Toggle
              checked={settings.denoise}
              onChange={(denoise) => setSettings({ ...settings, denoise })}
              title="Reduce noise"
              hint="For low-light footage. The platform spends its bits on detail instead of grain."
            />
            <Toggle
              checked={settings.deband}
              onChange={(deband) => setSettings({ ...settings, deband })}
              title="Prevent banding"
              hint="Adds invisible fine grain so skies and gradients don’t turn into stripes."
            />
            <Toggle
              checked={settings.sharpen}
              onChange={(sharpen) => setSettings({ ...settings, sharpen })}
              title="Light sharpen"
              hint="Helps text and slightly soft footage survive the platform’s scaler."
            />
          </fieldset>

          <div className="actions">
            {running ? (
              <button type="button" className="btn btn-ghost" onClick={cancel}>
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!source || selected.length === 0 || engineState === 'error'}
                onClick={start}
              >
                {selected.length > 1 ? `Optimize for ${selected.length} platforms` : 'Optimize video'}
              </button>
            )}
            <EngineStatus state={engineState} />
          </div>

          {job.state === 'running' && <Progress job={job} />}
          {job.state === 'error' && <pre className="alert">{job.message}</pre>}
        </section>

        {results.length > 0 && (
          <section className="panel" aria-labelledby="step-3">
            <StepTitle n={3} id="step-3">Download and post</StepTitle>
            <div className="results">
              {results.map((r) => (
                <ResultCard key={r.platform} result={r} source={source!} />
              ))}
            </div>
          </section>
        )}

        <section className="explainer">
          <h2>What Nova can and can’t do</h2>
          <div className="explainer-grid">
            <div>
              <h3>What it fixes</h3>
              <p>
                Resolution, frame rate, color tagging, HDR, bitrate and file structure, all set to each
                platform’s published spec. Out-of-spec files get an extra, cheaper conversion on the
                platform’s side, and that’s where most avoidable quality loss comes from.
              </p>
            </div>
            <div>
              <h3>What nobody can fix</h3>
              <p>
                TikTok, Instagram and Facebook always re-encode uploads on their servers, and Meta saves
                its best encodes for videos people watch. Tools that promise “no compression” rely on
                file tricks that break whenever the platform updates.
              </p>
            </div>
            <div>
              <h3>Your privacy</h3>
              <p>
                Nova never uploads your video. Encoding happens on your device, and location and camera
                metadata are removed from the output.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <CosmosMark className="footer-mark" />
        <span>
          Nova is made by <a href={BRAND_URL} target="_blank" rel="noreferrer">Creation of Cosmos</a>, a
          video editing studio in Makati.
        </span>
      </footer>
    </div>
  )
}

function StepTitle({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <h2 className="step-title" id={id}>
      <span className="step-n">{n}</span>
      {children}
    </h2>
  )
}

function DropZone({ onFile, disabled, file }: { onFile: (f: File) => void; disabled: boolean; file: File | null }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div
      className={`dropzone ${over ? 'is-over' : ''} ${disabled ? 'is-disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f && !disabled) onFile(f)
      }}
    >
      <input
        ref={input}
        type="file"
        accept="video/*,.mov,.mp4,.m4v,.mkv,.webm"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      <p className="dropzone-title">{file ? file.name : 'Drop a video here'}</p>
      <p className="muted">MP4, MOV or WebM · up to 500 MB and 3 minutes · 4K and iPhone HDR welcome</p>
      <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => input.current?.click()}>
        {file ? 'Choose another file' : 'Choose a file'}
      </button>
    </div>
  )
}

function SourceSummary({ source, file }: { source: SourceInfo; file: File }) {
  const fps = source.frameRate.num / source.frameRate.den
  const out = targetFrameRate(source.frameRate)
  const outFps = out.num / out.den
  const notes: string[] = []
  if (Math.max(source.width, source.height) > 1920) notes.push('Larger than 1080p. Nova downscales it with a sharp filter, which beats letting the platform do it.')
  if (Math.abs(fps - outFps) > 0.01) notes.push(`${formatFps(fps)} fps will become ${formatFps(outFps)} fps, the closest rate all three platforms accept.`)
  if (source.hdr) notes.push(`${source.hdr === 'hlg' ? 'HLG' : 'HDR10'} HDR detected, typical of iPhone footage.`)
  if (!source.hasAudio) notes.push('No audio track.')
  return (
    <div className="source">
      <dl className="facts">
        <Fact k="Resolution" v={`${source.width}×${source.height}`} />
        <Fact k="Frame rate" v={`${formatFps(fps)} fps`} />
        <Fact k="Length" v={formatDuration(source.durationSec)} />
        <Fact k="Size" v={formatBytes(file.size)} />
        <Fact k="Codec" v={`${source.videoCodec.toUpperCase()} ${source.bitDepth}-bit`} />
        <Fact k="Color" v={source.hdr ? (source.hdr === 'hlg' ? 'HDR (HLG)' : 'HDR (PQ)') : 'SDR'} />
      </dl>
      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="fact">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: { value: T; label: string; hint: string }[]
  onChange: (v: T) => void
  disabled: boolean
}) {
  const hint = options.find((o) => o.value === value)?.hint
  return (
    <div className="segmented-wrap">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'is-on' : ''}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="muted small">{hint}</span>
    </div>
  )
}

function Toggle({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-text">
        <span className="toggle-title">{title}</span>
        <span className="muted small">{hint}</span>
      </span>
    </label>
  )
}

function EngineStatus({ state }: { state: 'idle' | 'loading' | 'ready' | 'error' }) {
  if (state === 'loading') return <span className="muted small">Loading the video engine (about 30 MB, first visit only)…</span>
  if (state === 'error')
    return <span className="alert small">The video engine couldn’t load. Check your connection and reload the page.</span>
  return null
}

function Progress({ job }: { job: Extract<Job, { state: 'running' }> }) {
  const pct = Math.round(job.fraction * 100)
  const elapsed = (Date.now() - job.startedAt) / 1000
  const eta = job.fraction > 0.03 ? elapsed / job.fraction - elapsed : null
  return (
    <div className="progress" role="status">
      <div className="progress-head">
        <span>
          {getPlatform(job.platform).label}
          {job.total > 1 && <span className="muted"> · {job.index + 1} of {job.total}</span>}
        </span>
        <span className="muted">
          {pct}%{eta !== null && ` · about ${formatDuration(eta)} left`}
        </span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">Keep this tab open. Encoding uses your device’s processor and can take a few minutes.</p>
    </div>
  )
}

function ResultCard({ result, source }: { result: Result; source: SourceInfo }) {
  const p = getPlatform(result.platform)
  const size = result.blob.size
  const mbps = source.durationSec > 0 ? (size * 8) / source.durationSec / 1e6 : null
  const tooBig = size > p.maxBytes
  const big = !tooBig && p.softMaxBytes !== undefined && size > p.softMaxBytes
  const portrait = p.height > p.width
  return (
    <article className="result">
      <video className={`preview ${portrait ? 'is-portrait' : ''}`} src={result.url} controls playsInline preload="metadata" />
      <div className="result-body">
        <h3>{p.label}</h3>
        <p className="muted small">
          {p.width}×{p.height} · {formatBytes(size)}
          {mbps !== null && ` · ${mbps.toFixed(1)} Mbps`}
        </p>
        {tooBig && <p className="alert small">This is over {p.label}’s {formatBytes(p.maxBytes)} limit. Trim the video and try again.</p>}
        {big && <p className="warn small">Over 100 MB. TikTok accepts it, but large files reportedly play back choppy on some phones.</p>}
        <a className="btn btn-primary" href={result.url} download={result.name}>
          Download
        </a>
        <h4>Posting tips</h4>
        <ul className="tips">
          {p.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </article>
  )
}
