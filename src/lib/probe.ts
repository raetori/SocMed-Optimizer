// Turns ffprobe JSON (-show_streams -show_format) into the facts the presets need.

import type { Rational } from './presets'

export type HdrKind = 'hlg' | 'pq'

export interface SourceInfo {
  /** Display size, after rotation metadata is applied. */
  width: number
  height: number
  frameRate: Rational
  durationSec: number
  videoCodec: string
  pixFmt: string
  bitDepth: number
  colorTransfer: string | null
  colorPrimaries: string | null
  hdr: HdrKind | null
  hasAudio: boolean
  bitrate: number | null
}

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  pix_fmt?: string
  bits_per_raw_sample?: string
  r_frame_rate?: string
  avg_frame_rate?: string
  color_transfer?: string
  color_primaries?: string
  duration?: string
  sample_rate?: string
  bit_rate?: string
  tags?: Record<string, string>
  side_data_list?: { side_data_type?: string; rotation?: number }[]
  disposition?: { attached_pic?: number }
}

export interface ProbeJson {
  streams?: ProbeStream[]
  format?: { duration?: string; bit_rate?: string }
}

export function parseRate(s: string | undefined): Rational | null {
  if (!s) return null
  const [n, d] = s.split('/').map(Number)
  const den = d === undefined ? 1 : d
  if (!Number.isFinite(n) || !Number.isFinite(den) || n <= 0 || den <= 0) return null
  return { num: n, den }
}

export function parseProbe(json: ProbeJson): SourceInfo {
  const streams = json.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  if (!video || !video.width || !video.height) {
    throw new Error('No video track found in this file.')
  }

  const rotation = Math.abs(
    video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
      Number(video.tags?.rotate ?? 0),
  )
  const swap = rotation % 180 === 90
  const width = swap ? video.height : video.width
  const height = swap ? video.width : video.height

  // avg_frame_rate reflects variable-frame-rate phone footage better than r_frame_rate.
  const frameRate = parseRate(video.avg_frame_rate) ?? parseRate(video.r_frame_rate) ?? { num: 30, den: 1 }

  const transfer = video.color_transfer ?? null
  const hdr: HdrKind | null =
    transfer === 'arib-std-b67' ? 'hlg' : transfer === 'smpte2084' ? 'pq' : null

  const pixFmt = video.pix_fmt ?? 'unknown'
  const depthMatch = pixFmt.match(/p(\d+)(le|be)$/)
  const bitDepth = Number(video.bits_per_raw_sample) || (depthMatch ? Number(depthMatch[1]) : 8)

  const durationSec = Number(json.format?.duration ?? video.duration ?? 0) || 0
  const bitrate = Number(json.format?.bit_rate ?? video.bit_rate) || null

  return {
    width,
    height,
    frameRate,
    durationSec,
    videoCodec: video.codec_name ?? 'unknown',
    pixFmt,
    bitDepth,
    colorTransfer: transfer,
    colorPrimaries: video.color_primaries ?? null,
    hdr,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
    bitrate,
  }
}
