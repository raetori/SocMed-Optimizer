// Test pack: one clip exported several ways, so real uploads show which
// settings survive each platform best. Each variant changes one thing from
// the baseline so the results can be compared fairly.

import type { SourceInfo } from './probe'
import { getPlatform, outputFrameRate, outputSize, type EncodeOptions, type PlatformId } from './presets.ts'

export interface Variant {
  code: string
  name: string
  /** The question this variant answers. */
  question: string
  overrides: Partial<EncodeOptions>
  /** Why it was left out for this clip or platform, if it was. */
  skip?: (src: SourceInfo, platform: PlatformId) => string | null
}

export const VARIANTS: Variant[] = [
  {
    code: 'A',
    name: 'Baseline',
    question: 'Nova’s standard preset. Every other variant changes one thing from this.',
    overrides: {},
  },
  {
    code: 'B',
    name: 'Max quality',
    question: 'Does a much higher-quality upload (CRF 12) survive better, or does the platform throw it away?',
    overrides: { crf: 12 },
  },
  {
    code: 'C',
    name: 'Lean',
    question: 'Does a smaller, half-bitrate file get treated the same? If so, smaller is safer.',
    overrides: { crf: 21, bitrateCap: 0.5 },
  },
  {
    code: 'D',
    name: 'Constant bitrate',
    question: 'Creators report high constant bitrate beats variable. Does it here?',
    overrides: { rateControl: 'cbr' },
  },
  {
    code: 'E',
    name: '1440p',
    question: 'Does a higher-resolution upload get a sharper encode ladder?',
    overrides: { resolutionScale: 4 / 3 },
  },
  {
    code: 'F',
    name: 'Pre-sharpened + grain',
    question: 'Does light sharpening and grain survive the platform’s soft scaler?',
    overrides: { sharpen: true, deband: true },
  },
  {
    code: 'G',
    name: 'Denoised + dark detail',
    question: 'Does removing noise and protecting shadows leave more bits for real detail?',
    overrides: { denoise: true, darkDetail: true },
  },
  {
    code: 'H',
    name: 'HEVC (H.265)',
    question: 'Does uploading HEVC instead of H.264 change what the platform serves?',
    overrides: { codec: 'hevc', crf: 19 },
  },
  {
    code: 'I',
    name: '4K',
    question: 'Does TikTok serve a sharper version of a 4K upload?',
    overrides: { resolutionScale: 2 },
    skip: (_src, platform) =>
      platform === 'tiktok' ? null : 'Meta caps uploads at 1920 px wide, so 4K would be resized by them anyway.',
  },
  {
    code: 'J',
    name: '30 fps',
    question: 'Does 60 fps footage look better uploaded at 30, with twice the bits per frame?',
    overrides: { maxFps: 30 },
    skip: (src) =>
      src.frameRate.num / src.frameRate.den > 31 ? null : 'The clip is already 30 fps or lower.',
  },
]

export function applicableVariants(src: SourceInfo, platform: PlatformId): { variant: Variant; skipped: string | null }[] {
  return VARIANTS.map((variant) => ({ variant, skipped: variant.skip?.(src, platform) ?? null }))
}

/** Human-readable summary of what a variant's settings are, for the sheet. */
export function describeSettings(src: SourceInfo, opts: EncodeOptions): string {
  const { width, height } = outputSize(opts)
  const fps = outputFrameRate(src, opts)
  const p = getPlatform(opts.platform)
  const cap = Math.round((p.maxrate * opts.bitrateCap) / 1e6)
  const parts = [
    `${width}x${height}`,
    `${+(fps.num / fps.den).toFixed(2)} fps`,
    opts.codec === 'hevc' ? 'HEVC' : 'H.264',
    opts.rateControl === 'cbr' ? `CBR ${cap} Mbps` : `CRF ${opts.crf}, max ${cap} Mbps`,
  ]
  if (opts.denoise) parts.push('denoise')
  if (opts.sharpen) parts.push('sharpen')
  if (opts.deband) parts.push('grain')
  if (opts.darkDetail) parts.push('dark detail')
  if (opts.fit === 'fill') parts.push('fill')
  return parts.join(', ')
}

export interface SheetRow {
  code: string
  name: string
  file: string
  settings: string
  sizeBytes: number
  mbps: number | null
}

/** CSV with blank columns for the tester to fill in after posting. */
export function buildSheet(rows: SheetRow[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const header = ['variant', 'name', 'file', 'settings', 'size_mb', 'mbps', 'posted_link', 'score_1_to_5', 'notes']
  const lines = rows.map((r) =>
    [r.code, r.name, r.file, r.settings, (r.sizeBytes / 1024 / 1024).toFixed(1), r.mbps?.toFixed(1) ?? '', '', '', '']
      .map((v) => esc(String(v)))
      .join(','),
  )
  return [header.join(','), ...lines].join('\n') + '\n'
}

export function buildReadme(clipName: string, platform: PlatformId, rows: SheetRow[]): string {
  const p = getPlatform(platform)
  return [
    `Nova test pack: ${clipName} for ${p.label}`,
    '',
    'How to test',
    '1. Post every file to the same test account, one after another, with the same caption style.',
    '   Upload from a desktop browser, set them public, and add no in-app sounds or effects.',
    '2. Wait 30 minutes, then watch each post on the same phone, on Wi-Fi, at full brightness.',
    '3. Score each one from 1 to 5 in results.csv, paste its link, and note what you see',
    '   (blocky shadows, soft text, banding, smeared motion).',
    '4. Send results.csv back, along with the posts, so the winners can become the default.',
    '',
    'Variants',
    ...rows.map((r) => `${r.code}  ${r.name.padEnd(24)} ${r.settings}`),
    '',
  ].join('\n')
}
