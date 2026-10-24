// Per-platform encode settings, from the phase 1 research report.
// Everything here is pure so it can be unit tested and run against native ffmpeg.

import type { SourceInfo } from './probe'

export type PlatformId = 'tiktok' | 'instagram' | 'facebook-reels' | 'facebook-feed'
export type FitMode = 'fit' | 'fill'
export type Speed = 'fast' | 'balanced' | 'best'

export interface Platform {
  id: PlatformId
  label: string
  format: string
  width: number
  height: number
  /** VBV ceiling. Meta ingest caps at 25 Mbps VBR, so Meta presets keep headroom. */
  maxrate: number
  audioBitrate: number
  /** Hard upload limit in bytes, where one is documented. */
  maxBytes: number
  /** Size above which the platform is reported to misbehave. */
  softMaxBytes?: number
  tips: string[]
}

const MB = 1024 * 1024

export const PLATFORMS: Platform[] = [
  {
    id: 'tiktok',
    label: 'TikTok',
    format: '9:16 · 1080×1920',
    width: 1080,
    height: 1920,
    maxrate: 24_000_000,
    audioBitrate: 192_000,
    maxBytes: 4096 * MB,
    softMaxBytes: 100 * MB,
    tips: [
      'Upload from tiktok.com or TikTok Studio in a desktop browser, not the phone app.',
      'Post as Everyone. Private posts reportedly don’t get the HD encode.',
      'Don’t add a TikTok sound or in-app effects. Each one forces another re-encode.',
      'If you must use the app, turn on “Upload HD” first.',
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram Reels',
    format: '9:16 · 1080×1920',
    width: 1080,
    height: 1920,
    maxrate: 20_000_000,
    audioBitrate: 128_000,
    maxBytes: 300 * MB,
    tips: [
      'In the app, turn on Settings → Data usage and media quality → “Upload at highest quality”.',
      'Move the file to your phone by cable, AirDrop or a cloud drive, never through WhatsApp or iMessage.',
      'The HD version can take 10 to 20 minutes to appear. Judge quality later, on Wi-Fi.',
      'Instagram serves sharper encodes to videos that get watched, so early views help.',
    ],
  },
  {
    id: 'facebook-reels',
    label: 'Facebook Reels',
    format: '9:16 · 1080×1920',
    width: 1080,
    height: 1920,
    maxrate: 20_000_000,
    audioBitrate: 128_000,
    maxBytes: 300 * MB,
    tips: [
      'In the app, turn on “Upload videos in HD” under media settings, or upload from a desktop browser.',
      'The HD version appears a few minutes after posting.',
      'Facebook gives better encodes to videos that get watched.',
    ],
  },
  {
    id: 'facebook-feed',
    label: 'Facebook feed',
    format: '16:9 · 1920×1080',
    width: 1920,
    height: 1080,
    maxrate: 20_000_000,
    audioBitrate: 128_000,
    maxBytes: 4096 * MB,
    tips: [
      'Upload from a desktop browser, or turn on “Upload videos in HD” in the app.',
      'The HD version appears a few minutes after posting.',
    ],
  },
]

export function getPlatform(id: PlatformId): Platform {
  const p = PLATFORMS.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown platform ${id}`)
  return p
}

export interface EncodeOptions {
  platform: PlatformId
  fit: FitMode
  speed: Speed
  /** Convert HDR (HLG/PQ) to SDR Rec.709 with the Hable operator Meta uses. */
  toneMap: boolean
  /** Nominal peak luminance for the HDR conversion, 100 to 203. Lower is brighter. */
  hdrPeak: number
  denoise: boolean
  deband: boolean
  sharpen: boolean
}

export const DEFAULT_OPTIONS: Omit<EncodeOptions, 'platform'> = {
  fit: 'fit',
  speed: 'balanced',
  toneMap: true,
  hdrPeak: 203,
  denoise: false,
  deband: false,
  sharpen: false,
}

const X264_PRESET: Record<Speed, string> = {
  fast: 'veryfast',
  balanced: 'medium',
  best: 'slow',
}

export const CRF = 17

export interface Rational {
  num: number
  den: number
}

/**
 * All three platforms ingest 23 to 60 fps. Keep the source rate when it fits,
 * halve high-frame-rate footage (120 → 60, 119.88 → 59.94), and lift anything
 * below 23 to 30 so ingest never normalises it.
 */
export function targetFrameRate(src: Rational): Rational {
  const fps = src.num / src.den
  if (!Number.isFinite(fps) || fps <= 0) return { num: 30, den: 1 }
  if (fps > 60.5) {
    const half = fps / 2
    if (half <= 60.5 && half >= 23) return normalizeRate({ num: src.num, den: src.den * 2 })
    return { num: 60, den: 1 }
  }
  if (fps < 23) return { num: 30, den: 1 }
  return normalizeRate(src)
}

/** Snap near-standard rates (29.97 reported as 2997/100 etc.) to their exact NTSC form. */
export function normalizeRate(r: Rational): Rational {
  const fps = r.num / r.den
  const standard: Rational[] = [
    { num: 24000, den: 1001 },
    { num: 24, den: 1 },
    { num: 25, den: 1 },
    { num: 30000, den: 1001 },
    { num: 30, den: 1 },
    { num: 50, den: 1 },
    { num: 60000, den: 1001 },
    { num: 60, den: 1 },
  ]
  for (const s of standard) {
    if (Math.abs(fps - s.num / s.den) < 0.005) return s
  }
  const g = gcd(r.num, r.den)
  return { num: r.num / g, den: r.den / g }
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a))
  b = Math.abs(Math.round(b))
  while (b) [a, b] = [b, a % b]
  return a || 1
}

export function rateToString(r: Rational): string {
  return r.den === 1 ? String(r.num) : `${r.num}/${r.den}`
}

export function buildFilterGraph(src: SourceInfo, opts: EncodeOptions): string {
  const p = getPlatform(opts.platform)
  const { width: W, height: H } = p
  const fps = targetFrameRate(src.frameRate)
  const filters: string[] = []
  const aspect = opts.fit === 'fill' ? 'increase' : 'decrease'
  const hdr = src.hdr !== null && opts.toneMap

  if (hdr) {
    // Downscale first (still 10-bit), so the float tone-map runs on far fewer pixels.
    filters.push(`scale=${W}:${H}:flags=lanczos:force_original_aspect_ratio=${aspect}:force_divisible_by=2`)
    const tin = src.hdr === 'pq' ? 'smpte2084' : 'arib-std-b67'
    filters.push(
      `zscale=tin=${tin}:pin=bt2020:min=bt2020nc:rin=tv:t=linear:npl=${clamp(opts.hdrPeak, 100, 203)}`,
      'format=gbrpf32le',
      'zscale=p=bt709',
      'tonemap=tonemap=hable:desat=0',
      'zscale=t=bt709:m=bt709:r=tv',
      'format=yuv420p',
    )
  } else {
    filters.push(
      `scale=${W}:${H}:flags=lanczos:force_original_aspect_ratio=${aspect}:force_divisible_by=2:out_color_matrix=bt709:out_range=tv`,
    )
  }

  if (opts.fit === 'fill') filters.push(`crop=${W}:${H}`)
  else filters.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`)
  filters.push('setsar=1')
  // Constant frame rate: phones record variable frame rate, which confuses encoders.
  filters.push(`fps=${rateToString(fps)}`)

  if (opts.denoise) filters.push('hqdn3d=1.5:1.5:6:6')
  if (opts.sharpen) filters.push('unsharp=5:5:0.4:5:5:0.0')
  // Fine temporal grain before the 8-bit conversion breaks up banding in gradients.
  if (opts.deband) filters.push('noise=alls=2:allf=t')
  filters.push('format=yuv420p')
  return filters.join(',')
}

export function buildFfmpegArgs(
  src: SourceInfo,
  opts: EncodeOptions,
  input: string,
  output: string,
): string[] {
  const p = getPlatform(opts.platform)
  const fps = targetFrameRate(src.frameRate)
  const gop = Math.max(1, Math.round((2 * fps.num) / fps.den))
  const kbps = (bps: number) => `${Math.round(bps / 1000)}k`

  const args = [
    '-hide_banner',
    '-i', input,
    '-map', '0:v:0',
  ]
  if (src.hasAudio) args.push('-map', '0:a:0')
  args.push(
    '-vf', buildFilterGraph(src, opts),
    '-c:v', 'libx264',
    '-preset', X264_PRESET[opts.speed],
    '-profile:v', 'high',
    '-level:v', '4.2',
    '-crf', String(CRF),
    '-maxrate', kbps(p.maxrate),
    '-bufsize', kbps(p.maxrate * 2),
    '-g', String(gop),
    '-bf', '2',
    '-flags', '+cgop',
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-color_range', 'tv',
  )
  if (src.hasAudio) {
    args.push('-c:a', 'aac', '-b:a', kbps(p.audioBitrate), '-ar', '48000', '-ac', '2')
  } else {
    args.push('-an')
  }
  args.push(
    // Drops phone metadata such as GPS location; rotation is already applied to the pixels.
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-movflags', '+faststart',
    '-use_editlist', '0',
    '-y', output,
  )
  return args
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function outputFileName(inputName: string, platform: PlatformId): string {
  const base = inputName.replace(/\.[^.]+$/, '') || 'video'
  return `${base}_${platform}.mp4`
}
