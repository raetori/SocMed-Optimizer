import { useCallback, useEffect, useRef, useState } from 'react'
import type { SourceInfo } from '../lib/probe'
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
} from '../lib/presets'
import { engine } from '../lib/engineSingleton'
import { formatBytes, formatDuration, formatFps } from '../lib/format'
import { PROFILES, getProfile, type ProfileId } from '../lib/profiles'
import { applicableVariants, buildReadme, buildSheet, describeSettings, type SheetRow } from '../lib/testpack'
import { DropZone, EngineStatus, Segmented, StepTitle, Toggle } from '../ui'

const MAX_BYTES = 500 * 1024 * 1024
const MAX_SECONDS = 180
// A test pack encodes the clip up to ten times, so keep it short.
const PACK_MAX_SECONDS = 60

type Settings = Omit<EncodeOptions, 'platform'>
type Mode = 'optimize' | 'pack'

interface Result {
  platform: PlatformId
  blob: Blob
  url: string
  name: string
}

interface PackResult extends Result {
  code: string
  variantName: string
  question: string
  settings: string
}

type Job =
  | { state: 'idle' }
  | { state: 'running'; label: string; index: number; total: number; fraction: number; speed: number | null; startedAt: number }
  | { state: 'done' }
  | { state: 'error'; message: string }

export default function Optimize() {
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState<SourceInfo | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const [engineState, setEngineState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selected, setSelected] = useState<PlatformId[]>(['tiktok'])
  const [settings, setSettings] = useState<Settings>(DEFAULT_OPTIONS)
  const [job, setJob] = useState<Job>({ state: 'idle' })
  const [results, setResults] = useState<Result[]>([])
  const [mode, setMode] = useState<Mode>('optimize')
  const [profile, setProfile] = useState<ProfileId>('general')
  const [packPlatform, setPackPlatform] = useState<PlatformId>('tiktok')
  const [packOff, setPackOff] = useState<string[]>([])
  const [packResults, setPackResults] = useState<PackResult[]>([])
  const cancelled = useRef(false)

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
    setPackResults((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.url))
      return []
    })
  }, [])

  const chooseProfile = (id: ProfileId) => {
    setProfile(id)
    setSettings((s) => ({ ...s, ...getProfile(id).settings }))
  }

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
        setJob({ state: 'running', label: getPlatform(platform).label, index: i, total: order.length, fraction: 0, speed: null, startedAt: Date.now() })
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

  const packList = source ? applicableVariants(source, packPlatform) : []
  const packToRun = packList.filter((v) => !v.skipped && !packOff.includes(v.variant.code)).map((v) => v.variant)
  const packTooLong = source !== null && source.durationSec > PACK_MAX_SECONDS + 0.5

  const startPack = async () => {
    if (!file || !source || packToRun.length === 0 || packTooLong) return
    clearResults()
    cancelled.current = false
    try {
      for (let i = 0; i < packToRun.length; i++) {
        const v = packToRun[i]
        const opts: EncodeOptions = { ...settings, ...v.overrides, platform: packPlatform }
        setJob({ state: 'running', label: `${v.code} · ${v.name}`, index: i, total: packToRun.length, fraction: 0, speed: null, startedAt: Date.now() })
        const blob = await engine.encode(file, source, opts, (fraction, speed) =>
          setJob((j) => (j.state === 'running' ? { ...j, fraction, speed: speed ?? j.speed } : j)),
        )
        if (cancelled.current) return
        const slug = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        setPackResults((prev) => [
          ...prev,
          {
            platform: packPlatform,
            blob,
            url: URL.createObjectURL(blob),
            name: outputFileName(file.name, packPlatform, `${v.code}-${slug}`),
            code: v.code,
            variantName: v.name,
            question: v.question,
            settings: describeSettings(source, opts),
          },
        ])
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
    <>
      <section className="hero">
        <p className="eyebrow">Video optimizer for TikTok, Instagram and Facebook</p>
        <h1>Post video that still looks like your export.</h1>
        <p className="lede">
          Every platform re-encodes what you upload. Nova hands them a file built to their exact ingest
          spec, so their compression does as little damage as possible. It all runs in your browser. Your
          video never leaves your device.
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
        <div className="mode-row">
          <Segmented<Mode>
            label="Mode"
            value={mode}
            disabled={running}
            onChange={(m) => {
              setMode(m)
              setJob({ state: 'idle' })
              if (m === 'pack') setSettings((s) => ({ ...s, speed: 'fast' }))
            }}
            options={[
              { value: 'optimize', label: 'Optimize', hint: 'One best file per platform' },
              { value: 'pack', label: 'Test pack', hint: 'Up to 10 versions for one platform, to find what survives best' },
            ]}
          />
        </div>
        <div className="platforms" role="group" aria-label="Platforms">
          {PLATFORMS.map((p) => {
            const on = mode === 'pack' ? packPlatform === p.id : selected.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={`platform ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                disabled={running}
                onClick={() =>
                  mode === 'pack'
                    ? setPackPlatform(p.id)
                    : setSelected((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))
                }
              >
                <span className="platform-name">{p.label}</span>
                <span className="platform-format">{p.format}</span>
              </button>
            )
          })}
        </div>

        <div className="profile-block">
          <span className="field-label">What’s in this clip?</span>
          <div className="chips" role="radiogroup" aria-label="Content type">
            {PROFILES.map((pr) => (
              <button
                key={pr.id}
                type="button"
                role="radio"
                aria-checked={profile === pr.id}
                className={`chip ${profile === pr.id ? 'is-on' : ''}`}
                disabled={running}
                onClick={() => chooseProfile(pr.id)}
              >
                {pr.label}
              </button>
            ))}
          </div>
          <ProfileAdvice id={profile} />
        </div>

        {mode === 'pack' && source && (
          <fieldset className="variants" disabled={running}>
            <legend>Versions to export</legend>
            <p className="muted small">
              Each version is a full encode. A 10-second clip takes about 5 to 10 minutes for all of them on a
              laptop, longer for 4K and HEVC.
            </p>
            {packTooLong && (
              <p className="alert small">
                Test packs are limited to {PACK_MAX_SECONDS} seconds because every version is a full encode. Trim a
                10-second section that shows the hardest part of your footage.
              </p>
            )}
            {packList.map(({ variant, skipped }) => (
              <label key={variant.code} className={`variant ${skipped ? 'is-skipped' : ''}`}>
                <input
                  type="checkbox"
                  checked={!skipped && !packOff.includes(variant.code)}
                  disabled={!!skipped}
                  onChange={(e) =>
                    setPackOff((off) => (e.target.checked ? off.filter((c) => c !== variant.code) : [...off, variant.code]))
                  }
                />
                <span className="variant-code">{variant.code}</span>
                <span className="variant-text">
                  <span className="variant-name">
                    {variant.name}
                    {variant.code === 'I' && !skipped && <span className="variant-flag">very slow in the browser</span>}
                  </span>
                  <span className="muted small">
                    {skipped ??
                      (variant.code === 'I'
                        ? `${variant.question} Upscaling to 4K can take an hour or more here — if you already have a 4K master, upload that straight to the platform instead.`
                        : variant.question)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

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
          <Toggle
            checked={settings.darkDetail}
            onChange={(darkDetail) => setSettings({ ...settings, darkDetail })}
            title="Protect dark detail"
            hint="Spends more bits in shadows and flat areas, where blocking shows up first."
          />
        </fieldset>

        <div className="actions">
          {running ? (
            <button type="button" className="btn btn-ghost" onClick={cancel}>
              Cancel
            </button>
          ) : mode === 'pack' ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!source || packToRun.length === 0 || packTooLong || engineState === 'error'}
              onClick={startPack}
            >
              {`Export ${packToRun.length} test versions`}
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

      {packResults.length > 0 && file && (
        <section className="panel" aria-labelledby="step-3p">
          <StepTitle n={3} id="step-3p">Post every version and compare</StepTitle>
          <PackResults results={packResults} clipName={file.name} platform={packPlatform} durationSec={source?.durationSec ?? 0} />
        </section>
      )}

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
              Resolution, frame rate, color tagging, HDR, bitrate and file structure, all set to each platform’s
              published spec. Out-of-spec files get an extra, cheaper conversion on the platform’s side, and that’s
              where most avoidable quality loss comes from.
            </p>
          </div>
          <div>
            <h3>What nobody can fix</h3>
            <p>
              TikTok, Instagram and Facebook always re-encode uploads on their servers, and Meta saves its best
              encodes for videos people watch. Tools that promise “no compression” rely on file tricks that break
              whenever the platform updates.
            </p>
          </div>
          <div>
            <h3>Your privacy</h3>
            <p>
              Nova never uploads your video. Encoding happens on your device, and location and camera metadata are
              removed from the output.
            </p>
          </div>
        </div>
      </section>
    </>
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

function Progress({ job }: { job: Extract<Job, { state: 'running' }> }) {
  const pct = Math.round(job.fraction * 100)
  const elapsed = (Date.now() - job.startedAt) / 1000
  const eta = job.fraction > 0.03 ? elapsed / job.fraction - elapsed : null
  return (
    <div className="progress" role="status">
      <div className="progress-head">
        <span>
          {job.label}
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

function ProfileAdvice({ id }: { id: ProfileId }) {
  const p = getProfile(id)
  return (
    <div className="advice">
      <p>
        <strong>Watch out for:</strong> {p.risk}
      </p>
      <p>
        <strong>Nova will:</strong> {p.fix}
      </p>
      <ul>
        {p.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  )
}

function PackResults({
  results,
  clipName,
  platform,
  durationSec,
}: {
  results: PackResult[]
  clipName: string
  platform: PlatformId
  durationSec: number
}) {
  const rows: SheetRow[] = results.map((r) => ({
    code: r.code,
    name: r.variantName,
    file: r.name,
    settings: r.settings,
    sizeBytes: r.blob.size,
    mbps: durationSec > 0 ? (r.blob.size * 8) / durationSec / 1e6 : null,
  }))
  const base = clipName.replace(/\.[^.]+$/, '') || 'video'

  const downloadZip = async () => {
    const { zipSync } = await import('fflate')
    const entries: Record<string, [Uint8Array, { level: 0 }]> = {}
    for (const r of results) entries[r.name] = [new Uint8Array(await r.blob.arrayBuffer()), { level: 0 }]
    const enc = new TextEncoder()
    entries['results.csv'] = [enc.encode(buildSheet(rows)), { level: 0 }]
    entries['README.txt'] = [enc.encode(buildReadme(clipName, platform, rows)), { level: 0 }]
    const zip = zipSync(entries)
    saveBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${base}_${platform}_test-pack.zip`)
  }

  return (
    <>
      <p className="muted">
        Post all {results.length} to the same test account, then score each one in the results sheet. The variant
        letter is in every file name, so you can tell them apart after posting.
      </p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={downloadZip}>
          Download all + results sheet (.zip)
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => saveBlob(new Blob([buildSheet(rows)], { type: 'text/csv' }), `${base}_${platform}_results.csv`)}
        >
          Results sheet only (.csv)
        </button>
      </div>
      <div className="pack-grid">
        {results.map((r, i) => (
          <article key={r.code} className="pack-card">
            <div className="pack-head">
              <span className="variant-code">{r.code}</span>
              <span className="variant-name">{r.variantName}</span>
            </div>
            <p className="muted small">{r.question}</p>
            <p className="small">{r.settings}</p>
            <p className="muted small">
              {formatBytes(r.blob.size)}
              {rows[i].mbps !== null && ` · ${rows[i].mbps!.toFixed(1)} Mbps`}
            </p>
            <a className="btn btn-secondary btn-small" href={r.url} download={r.name}>
              Download {r.code}
            </a>
          </article>
        ))}
      </div>
    </>
  )
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
