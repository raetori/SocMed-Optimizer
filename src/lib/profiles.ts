// Content profiles: what predictably goes wrong for each kind of footage once a
// platform re-encodes it, and which settings counter it. Picking a profile sets
// the clean-up options; the advice is shown alongside.

import { CRF, type EncodeOptions } from './presets.ts'

export type ProfileId = 'general' | 'lowlight' | 'motion' | 'detail' | 'skies' | 'dark' | 'text' | 'skin'

export interface ContentProfile {
  id: ProfileId
  label: string
  /** What the platform's encoder tends to do to this content. */
  risk: string
  /** What Nova changes, in plain words. */
  fix: string
  /** Things only the creator can do, before or after export. */
  tips: string[]
  settings: Partial<EncodeOptions>
}

const OFF: Partial<EncodeOptions> = { denoise: false, deband: false, sharpen: false, darkDetail: false, crf: CRF }

export const PROFILES: ContentProfile[] = [
  {
    id: 'general',
    label: 'General',
    risk: 'Mixed footage usually survives well when it arrives at the right size, frame rate and color.',
    fix: 'Standard platform preset, no extra filters.',
    tips: ['If one shot breaks up after posting, pick the profile that matches that shot.'],
    settings: { ...OFF },
  },
  {
    id: 'lowlight',
    label: 'Low light / grainy',
    risk: 'Sensor noise changes every frame, so the platform spends its bits on grain and the picture turns to blotchy mush.',
    fix: 'Light temporal denoise, plus extra bits in dark areas.',
    tips: [
      'Denoise in your editor first if you can (Neat Video, Resolve). It does a better job than a quick filter.',
      'Expose a little brighter on set. Lifting shadows in the edit multiplies the noise.',
    ],
    settings: { ...OFF, denoise: true, darkDetail: true },
  },
  {
    id: 'motion',
    label: 'Fast motion / sports',
    risk: 'Fast pans, shaky handheld and action need far more bitrate than the platform allows, so they smear and block.',
    fix: 'Higher quality (CRF 15) and the source frame rate kept up to 60 fps.',
    tips: [
      'Stabilize shaky footage. Steady frames compress far better.',
      'Shoot with a 180° shutter (1/50 at 25 fps, 1/60 at 30) so natural motion blur hides compression.',
      'Upload 60 fps only if the whole clip was shot at 60. Mixed 30/60 timelines stutter.',
    ],
    settings: { ...OFF, crf: 15 },
  },
  {
    id: 'detail',
    label: 'Busy detail (leaves, water, crowds, confetti)',
    risk: 'Thousands of small moving details are the hardest thing to compress. They go soft or shimmer.',
    fix: 'Higher quality (CRF 15) and no denoise, so the detail is still there when the platform encodes it.',
    tips: ['Fewer, slower moves help a lot. A locked-off shot of leaves survives much better than a fast pan across them.'],
    settings: { ...OFF, crf: 15 },
  },
  {
    id: 'skies',
    label: 'Skies & gradients',
    risk: 'Smooth gradients such as skies, studio backdrops and sunsets turn into visible stripes (banding) in 8-bit.',
    fix: 'Invisible fine grain before the 8-bit conversion, plus extra bits in flat areas.',
    tips: [
      'Grade and export from a 10-bit timeline (ProRes 422 or 10-bit HEVC master), then run that file through Nova.',
      'A little film grain in the grade hides banding better than anything added at the end.',
    ],
    settings: { ...OFF, deband: true, darkDetail: true },
  },
  {
    id: 'dark',
    label: 'Dark / moody grade',
    risk: 'Encoders starve dark areas first, so deep shadows go blocky and crushed blacks turn into flat patches.',
    fix: 'Extra bits in dark areas plus fine grain to keep shadow gradients smooth.',
    tips: [
      'Keep blacks just above pure black (about 2 to 4% on the waveform) instead of crushing them.',
      'Check the post on a phone at full brightness. That is how most viewers see it.',
    ],
    settings: { ...OFF, darkDetail: true, deband: true },
  },
  {
    id: 'text',
    label: 'Text, graphics, screen recordings',
    risk: 'Thin text and UI edges get soft, and colored text gets fuzzy edges because the platform halves color resolution.',
    fix: 'Light sharpening so edges survive the platform’s scaler.',
    tips: [
      'Use bold text at least 40 px tall on a 1080-wide frame, and avoid thin red or blue text on dark backgrounds.',
      'Keep text inside the safe area: platform buttons and captions cover the right side and the bottom fifth.',
      'Record screens at 1080p, not 4K, so the text isn’t downscaled twice.',
    ],
    settings: { ...OFF, sharpen: true },
  },
  {
    id: 'skin',
    label: 'Talking head / skin',
    risk: 'Faces mostly survive, but over-sharpened skin looks harsh after compression and smooth skin can go waxy.',
    fix: 'Standard preset with no sharpening, plus extra bits in shadows so skin tones stay smooth.',
    tips: [
      'Soft, even light on faces helps more than any export setting.',
      'Avoid heavy beauty filters before export. Compression stacks on top of them.',
    ],
    settings: { ...OFF, darkDetail: true },
  },
]

export function getProfile(id: ProfileId): ContentProfile {
  return PROFILES.find((p) => p.id === id) ?? PROFILES[0]
}
