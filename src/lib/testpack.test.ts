import { describe, expect, it } from 'vitest'
import { applicableVariants, buildSheet, VARIANTS } from './testpack'
import type { SourceInfo } from './probe'

const src: SourceInfo = {
  width: 1080, height: 1920, frameRate: { num: 60, den: 1 }, durationSec: 10,
  videoCodec: 'h264', pixFmt: 'yuv420p', bitDepth: 8, colorTransfer: 'bt709', colorPrimaries: 'bt709',
  hdr: null, hasAudio: true, bitrate: null,
}

describe('test pack', () => {
  it('has at least 8 variants on every platform', () => {
    for (const platform of ['tiktok', 'instagram', 'facebook-reels', 'facebook-feed'] as const) {
      for (const fps of [30, 60]) {
        const n = applicableVariants({ ...src, frameRate: { num: fps, den: 1 } }, platform).filter((v) => !v.skipped).length
        expect(n).toBeGreaterThanOrEqual(8)
      }
    }
  })
  it('offers 4K only for TikTok and 30 fps only for faster sources', () => {
    const skipped = (platform: 'tiktok' | 'instagram', fps: number) =>
      applicableVariants({ ...src, frameRate: { num: fps, den: 1 } }, platform).filter((v) => v.skipped).map((v) => v.variant.code)
    expect(skipped('tiktok', 60)).toEqual([])
    expect(skipped('instagram', 30)).toEqual(['I', 'J'])
  })
  it('uses unique letter codes', () => {
    expect(new Set(VARIANTS.map((v) => v.code)).size).toBe(VARIANTS.length)
  })
  it('writes a sheet with blank columns to fill in', () => {
    const csv = buildSheet([{ code: 'A', name: 'Baseline', file: 'a.mp4', settings: '1080x1920, 30 fps', sizeBytes: 2 * 1024 * 1024, mbps: 1.6 }])
    expect(csv.split('\n')[1]).toBe('A,Baseline,a.mp4,"1080x1920, 30 fps",2.0,1.6,,,')
  })
})
