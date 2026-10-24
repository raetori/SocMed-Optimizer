// Shared presentational pieces used across pages.

import { useRef, useState } from 'react'

export function StepTitle({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <h2 className="step-title" id={id}>
      <span className="step-n">{n}</span>
      {children}
    </h2>
  )
}

export function DropZone({
  onFile,
  disabled,
  file,
  title,
  hint,
}: {
  onFile: (f: File) => void
  disabled: boolean
  file: File | null
  title?: string
  hint?: string
}) {
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
      <p className="dropzone-title">{file ? file.name : title ?? 'Drop a video here'}</p>
      <p className="muted">{hint ?? 'MP4, MOV or WebM · up to 500 MB and 3 minutes · 4K and iPhone HDR welcome'}</p>
      <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => input.current?.click()}>
        {file ? 'Choose another file' : 'Choose a file'}
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
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

export function Toggle({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  hint: string
}) {
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

export function EngineStatus({ state }: { state: 'idle' | 'loading' | 'ready' | 'error' }) {
  if (state === 'loading') return <span className="muted small">Loading the video engine (about 30 MB, first visit only)…</span>
  if (state === 'error')
    return <span className="alert small">The video engine couldn’t load. Check your connection and reload the page.</span>
  return null
}
