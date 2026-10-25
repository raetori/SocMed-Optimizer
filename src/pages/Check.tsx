import { useEffect, useRef, useState } from 'react'
import { engine } from '../lib/engineSingleton'
import { compareQuality, measure, type Measured, type Similarity } from '../lib/measure'
import { formatBytes, formatDuration, formatFps } from '../lib/format'
import { DropZone, EngineStatus, StepTitle } from '../ui'

type State =
  | { kind: 'idle' }
  | { kind: 'measuring' }
  | { kind: 'done'; served: Measured; original: Measured | null; similarity: Similarity | null }
  | { kind: 'error'; message: string }

const LADDER = [360, 540, 720, 1080, 1440, 2160]

export default function Check() {
  const [served, setServed] = useState<File | null>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const [engineState, setEngineState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const busy = useRef(false)

  useEffect(() => {
    setEngineState('loading')
    engine.load().then(
      () => setEngineState('ready'),
      () => setEngineState('error'),
    )
  }, [])

  const run = async () => {
    if (!served || busy.current) return
    busy.current = true
    setState({ kind: 'measuring' })
    try {
      const servedInfo = await measure(served)
      const originalInfo = original ? await measure(original) : null
      let similarity: Similarity | null = null
      if (original) {
        try {
          similarity = await compareQuality(original, served)
        } catch {
          similarity = null
        }
      }
      setState({ kind: 'done', served: servedInfo, original: originalInfo, similarity })
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      busy.current = false
    }
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Nova · check</p>
        <h1>See what the platform really served.</h1>
        <p className="lede">
          The file in your camera roll is not the version the platform shows the world. Save the posted clip back
          to your device, drop it in, and Nova reads the resolution, frame rate and bitrate viewers actually get.
          Add your original export and it scores how much quality was kept.
        </p>
      </section>

      <section className="panel" aria-labelledby="c1">
        <StepTitle n={1} id="c1">The posted clip</StepTitle>
        <p className="muted small">
          Open your post, download or screen-record it, and drop that file here. Works for TikTok, Instagram and
          Facebook.
        </p>
        <DropZone
          onFile={(f) => {
            setServed(f)
            setState({ kind: 'idle' })
          }}
          disabled={state.kind === 'measuring'}
          file={served}
          title="Drop the platform's copy"
        />
      </section>

      <section className="panel" aria-labelledby="c2">
        <StepTitle n={2} id="c2">Your original export (optional)</StepTitle>
        <p className="muted small">
          Add the file you uploaded and Nova compares the two, frame by frame, for a quality-kept score.
        </p>
        <DropZone
          onFile={(f) => {
            setOriginal(f)
            setState({ kind: 'idle' })
          }}
          disabled={state.kind === 'measuring'}
          file={original}
          title="Drop your original export"
        />
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!served || state.kind === 'measuring' || engineState === 'error'}
            onClick={run}
          >
            {state.kind === 'measuring' ? 'Reading the file…' : 'Check it'}
          </button>
          <EngineStatus state={engineState} />
        </div>
        {state.kind === 'error' && <pre className="alert">{state.message}</pre>}
      </section>

      {state.kind === 'done' && <Report state={state} />}
    </>
  )
}

function Report({ state }: { state: Extract<State, { kind: 'done' }> }) {
  const { served, original, similarity } = state
  const servedH = Math.min(served.width, served.height)
  return (
    <section className="panel" aria-labelledby="c3">
      <StepTitle n={3} id="c3">What viewers get</StepTitle>

      <div className="served-grid">
        <Big k="Resolution" v={`${servedH}p`} sub={`${served.width}×${served.height}`} />
        <Big k="Frame rate" v={formatFps(served.frameRate.num / served.frameRate.den)} sub="fps" accent />
        <Big k="Bitrate" v={(served.effectiveBitrate / 1e6).toFixed(1)} sub="Mbps" />
        <Big k="File size" v={formatBytes(served.sizeBytes)} sub={formatDuration(served.durationSec)} />
      </div>

      <div className="ladder">
        <span className="field-label">Served resolution</span>
        <div className="ladder-track">
          {LADDER.map((r) => (
            <span key={r} className={`ladder-step ${servedH >= r ? 'is-on' : ''}`}>
              {r >= 1080 ? `${r}p` : `${r}p`}
            </span>
          ))}
        </div>
        <p className="muted small">
          {served.hdr ? 'Served in HDR.' : 'Served in SDR (standard dynamic range).'} Codec {served.videoCodec.toUpperCase()}.
        </p>
      </div>

      {original ? (
        <div className="kept">
          <h3>Compared with your export</h3>
          <dl className="facts">
            <Kept k="Resolution" from={`${Math.min(original.width, original.height)}p`} to={`${servedH}p`} />
            <Kept
              k="Frame rate"
              from={`${formatFps(original.frameRate.num / original.frameRate.den)} fps`}
              to={`${formatFps(served.frameRate.num / served.frameRate.den)} fps`}
            />
            <Kept
              k="Bitrate"
              from={`${(original.effectiveBitrate / 1e6).toFixed(1)} Mbps`}
              to={`${(served.effectiveBitrate / 1e6).toFixed(1)} Mbps`}
            />
          </dl>
          {similarity ? (
            <div className="score">
              <div className="score-ring" style={{ '--v': `${similarity.score}%` } as React.CSSProperties}>
                <span>{similarity.score}</span>
              </div>
              <div>
                <h4>Quality kept</h4>
                <p className="muted small">
                  An in-browser estimate ({similarity.psnr.toFixed(1)} dB PSNR) of how close the served frames are to
                  your export. Rough, not a lab VMAF score. Above 70 looks clean; below 50 is visibly degraded.
                </p>
              </div>
            </div>
          ) : (
            <p className="muted small">
              The frame-by-frame score couldn’t run on these two files (different lengths or a format the browser
              can’t decode), but the specs above still compare cleanly.
            </p>
          )}
        </div>
      ) : (
        <p className="muted small">
          Add your original export above and run it again for a side-by-side on resolution, bitrate and a
          quality-kept score.
        </p>
      )}

      <Verdict served={served} original={original} />
    </section>
  )
}

function Verdict({ served, original }: { served: Measured; original: Measured | null }) {
  const mbps = served.effectiveBitrate / 1e6
  const tips: string[] = []
  if (Math.min(served.width, served.height) < 720) tips.push('Served below 720p. Turn on Upload HD before posting, and start from a sharp, high-bitrate export.')
  if (mbps < 2) tips.push('The served bitrate is low. A higher-bitrate export gives the platform more to work with.')
  if (original && Math.min(served.width, served.height) < Math.min(original.width, original.height))
    tips.push('The platform downscaled your upload. That usually means Upload HD was off, or the file was out of spec.')
  if (tips.length === 0) tips.push('This is a healthy result for a social upload. Keep using the same export and Upload HD.')
  return (
    <div className="advice">
      <p>
        <strong>Reading:</strong> {mbps >= 2 && Math.min(served.width, served.height) >= 720 ? 'Served in good shape.' : 'Room to improve.'}
      </p>
      <ul>
        {tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  )
}

function Big({ k, v, sub, accent }: { k: string; v: string; sub: string; accent?: boolean }) {
  return (
    <div className="big">
      <span className="big-k">{k}</span>
      <span className={`big-v ${accent ? 'is-accent' : ''}`}>{v}</span>
      <span className="big-sub">{sub}</span>
    </div>
  )
}

function Kept({ k, from, to }: { k: string; from: string; to: string }) {
  return (
    <div className="fact">
      <dt>{k}</dt>
      <dd>
        {from} <span className="muted">→</span> {to}
      </dd>
    </div>
  )
}
