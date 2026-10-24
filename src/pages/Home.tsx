import { useRef, useState } from 'react'
import { navigate } from '../router'

export default function Home() {
  return (
    <>
      <section className="hero home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">Nova · video optimizer</p>
          <h1>
            Post the <span className="grad">quality you filmed.</span>
          </h1>
          <p className="lede">
            Every platform re-compresses your upload on the way in. Nova hands TikTok, Instagram and Facebook a
            file built to their exact spec, so the least possible quality is lost. It runs entirely in your
            browser, with no re-upload and no account.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => navigate('/optimize')}>
              Optimize a video →
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/check')}>
              Check a post
            </button>
          </div>
          <p className="muted small">Free. Your video never leaves your device.</p>
        </div>
        <Compare />
      </section>

      <section className="band">
        <p className="eyebrow">Three steps</p>
        <h2>From export to post.</h2>
        <div className="steps3">
          <Step3 n="01" title="Drop your clip" body="Any editor, any export. Up to 4K at 120 fps, up to 500 MB." />
          <Step3 n="02" title="Nova rebuilds it" body="Scaled, colour-tagged and packaged to the platform's own ingest spec, on your device." />
          <Step3 n="03" title="Post it" body="Download the file and post it from the app with Upload HD on." />
        </div>
      </section>

      <section className="band">
        <p className="eyebrow">What you get</p>
        <h2>Two tools, one goal.</h2>
        <div className="feature-grid">
          <FeatureCard
            title="Optimize"
            body="One best file per platform, or a test pack of up to ten versions so you can find which settings survive each feed best. Content profiles tune the clean-up for low light, motion, skies, dark grades, text and faces."
            cta="Optimize a video"
            to="/optimize"
          />
          <FeatureCard
            title="Check"
            body="Compare your original export with the copy a platform served. Nova reads the delivered resolution, frame rate and bitrate, and scores how much quality was kept. Works for TikTok, Instagram and Facebook."
            cta="Check a post"
            to="/check"
          />
          <FeatureCard
            title="Guides"
            body="Plain-language walkthroughs: how to export settings that survive the trip, why platforms compress your video, and how to check what viewers are really served."
            cta="Read the guides"
            to="/guides"
          />
        </div>
      </section>

      <section className="band">
        <p className="eyebrow">Questions, answered</p>
        <h2>The things people ask most.</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      <section className="cta-band">
        <h2>
          Your next post, <span className="grad">in full quality.</span>
        </h2>
        <p className="muted">Optimize a clip, then prove it survived with the check. Both free.</p>
        <div className="actions actions-center">
          <button type="button" className="btn btn-primary" onClick={() => navigate('/optimize')}>
            Optimize a video →
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/check')}>
            Check a post
          </button>
        </div>
      </section>
    </>
  )
}

// A draggable before/after wipe between the low-bitrate and full-quality clips,
// both cut from the same shot and aligned to the frame.
function Compare() {
  const [pos, setPos] = useState(50)
  const wrap = useRef<HTMLDivElement>(null)
  const low = useRef<HTMLVideoElement>(null)
  const hd = useRef<HTMLVideoElement>(null)

  const move = (clientX: number) => {
    const el = wrap.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }

  const play = () => {
    // Keep the two tracks in lockstep from the same start.
    for (const v of [low.current, hd.current]) {
      if (!v) continue
      v.currentTime = 0
      void v.play().catch(() => {})
    }
  }

  return (
    <div className="compare">
      <div
        className="compare-stage"
        ref={wrap}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          move(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons) move(e.clientX)
        }}
      >
        <video
          ref={hd}
          className="compare-video"
          src="/media/compare-hd.mp4"
          poster="/media/compare-poster.jpg"
          muted
          loop
          playsInline
          preload="auto"
          onLoadedData={play}
        />
        <div className="compare-top" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <video ref={low} className="compare-video" src="/media/compare-low.mp4" muted loop playsInline preload="auto" />
        </div>
        <span className="compare-tag compare-tag-left">Compressed</span>
        <span className="compare-tag compare-tag-right">Full quality</span>
        <div className="compare-handle" style={{ left: `${pos}%` }} aria-hidden="true">
          <span className="compare-grip">⇄</span>
        </div>
        <input
          className="compare-range"
          type="range"
          min={0}
          max={100}
          value={pos}
          aria-label="Reveal before and after"
          onChange={(e) => setPos(Number(e.target.value))}
        />
      </div>
      <p className="muted small compare-note">
        The same shot at a low bitrate and at full quality. Drag to compare what compression costs. (Footage by
        Creation of Cosmos.)
      </p>
    </div>
  )
}

function Step3({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="step3">
      <span className="step3-n">{n}</span>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  )
}

function FeatureCard({ title, body, cta, to }: { title: string; body: string; cta: string; to: string }) {
  return (
    <article className="feature-card">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      <button type="button" className="link-btn" onClick={() => navigate(to)}>
        {cta} →
      </button>
    </article>
  )
}

function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`faq-item ${open ? 'is-open' : ''}`}>
      <button type="button" className="faq-q" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{q}</span>
        <span className="faq-caret" aria-hidden="true">
          {open ? '–' : '+'}
        </span>
      </button>
      {open && <div className="faq-a">{a}</div>}
    </div>
  )
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What does the optimizer actually do?',
    a: (
      <p>
        It re-packages your export to each platform's published ingest spec: the right resolution and frame rate,
        correct colour tags, HDR tone-mapped to standard range, bitrate inside their ceiling, and the file
        structure they expect. Files that are out of spec get an extra, cheaper conversion on the platform's side,
        and that is where most avoidable quality loss comes from.
      </p>
    ),
  },
  {
    q: 'Does it stop the platform compressing my video?',
    a: (
      <p>
        No, and nothing can. TikTok, Instagram and Facebook always re-encode uploads on their servers. Nova's job
        is to hand them the cleanest possible starting point so their re-encode does the least damage. Tools that
        claim "no compression" rely on file tricks that break whenever the platform updates.
      </p>
    ),
  },
  {
    q: 'What formats work best?',
    a: (
      <p>
        Export at your real source quality, up to 4K at 120 fps, H.264 or HEVC in an MP4, at the highest bitrate
        your editor allows (around 15 to 25 Mbps for 1080p60). Skip the "recommended" or "TikTok" presets, which
        are tuned for small files rather than quality.
      </p>
    ),
  },
  {
    q: 'Is it safe for my account?',
    a: (
      <p>
        Yes. Nova only produces a normal, spec-compliant video file. It does not touch your account, automate
        posting, or alter the file in ways a platform could flag. You download the file and post it yourself.
      </p>
    ),
  },
  {
    q: 'Does my video get uploaded anywhere?',
    a: (
      <p>
        No. All the work happens in your browser on your own device. The video is never sent to a server, and
        location and camera metadata are stripped from the output.
      </p>
    ),
  },
  {
    q: 'How do I prove the quality held?',
    a: (
      <p>
        Use the Check page. Give it your original export and the copy you saved from the platform, and it reads the
        delivered resolution, frame rate and bitrate and scores how much quality was kept.
      </p>
    ),
  },
]
