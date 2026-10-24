import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs, buildFilterGraph, DEFAULT_OPTIONS, outputFileName, targetFrameRate } from './presets'
import { parseProbe } from './probe'
import type { SourceInfo } from './probe'

const sdr: SourceInfo = {
  width: 3840, height: 2160, frameRate: { num: 60, den: 1 }, durationSec: 10,
  videoCodec: 'h264', pixFmt: 'yuv420p', bitDepth: 8, colorTransfer: 'bt709', colorPrimaries: 'bt709',
  hdr: null, hasAudio: true, bitrate: 50_000_000,
}

describe('targetFrameRate', () => {
  it('keeps rates the platforms accept', () => {
    expect(targetFrameRate({ num: 30000, den: 1001 })).toEqual({ num: 30000, den: 1001 })
    expect(targetFrameRate({ num: 2997, den: 100 })).toEqual({ num: 30000, den: 1001 })
    expect(targetFrameRate({ num: 60, den: 1 })).toEqual({ num: 60, den: 1 })
    expect(targetFrameRate({ num: 25, den: 1 })).toEqual({ num: 25, den: 1 })
  })
  it('halves high frame rates', () => {
    expect(targetFrameRate({ num: 120, den: 1 })).toEqual({ num: 60, den: 1 })
    expect(targetFrameRate({ num: 120000, den: 1001 })).toEqual({ num: 60000, den: 1001 })
    expect(targetFrameRate({ num: 240, den: 1 })).toEqual({ num: 60, den: 1 })
  })
  it('lifts very low rates to 30', () => {
    expect(targetFrameRate({ num: 15, den: 1 })).toEqual({ num: 30, den: 1 })
    expect(targetFrameRate({ num: 0, den: 0 })).toEqual({ num: 30, den: 1 })
  })
})

describe('buildFfmpegArgs', () => {
  it('matches the report preset for TikTok', () => {
    const args = buildFfmpegArgs(sdr, { ...DEFAULT_OPTIONS, platform: 'tiktok' }, 'in.mov', 'out.mp4').join(' ')
    for (const part of [
      '-c:v libx264', '-profile:v high', '-level:v 4.2', '-crf 17', '-maxrate 24000k', '-bufsize 48000k',
      '-g 120', '-bf 2', '-flags +cgop', '-color_trc bt709', '-colorspace bt709', '-c:a aac', '-b:a 192k',
      '-ar 48000', '-movflags +faststart', '-use_editlist 0', '-map_metadata -1',
    ]) expect(args).toContain(part)
  })
  it('keeps Meta presets under the 25 Mbps ceiling', () => {
    const args = buildFfmpegArgs(sdr, { ...DEFAULT_OPTIONS, platform: 'instagram' }, 'i', 'o').join(' ')
    expect(args).toContain('-maxrate 20000k')
    expect(args).toContain('-b:a 128k')
  })
  it('drops audio mapping when there is no audio', () => {
    const args = buildFfmpegArgs({ ...sdr, hasAudio: false }, { ...DEFAULT_OPTIONS, platform: 'tiktok' }, 'i', 'o')
    expect(args).toContain('-an')
    expect(args.join(' ')).not.toContain('0:a:0')
  })
  it('uses a 2 second closed GOP at NTSC rates', () => {
    const args = buildFfmpegArgs({ ...sdr, frameRate: { num: 30000, den: 1001 } }, { ...DEFAULT_OPTIONS, platform: 'tiktok' }, 'i', 'o')
    expect(args[args.indexOf('-g') + 1]).toBe('60')
  })
})

describe('buildFilterGraph', () => {
  it('tone-maps HDR with Hable after downscaling', () => {
    const vf = buildFilterGraph({ ...sdr, hdr: 'hlg' }, { ...DEFAULT_OPTIONS, platform: 'instagram' })
    expect(vf.indexOf('scale=1080:1920')).toBeLessThan(vf.indexOf('tonemap=tonemap=hable'))
    expect(vf).toContain('tin=arib-std-b67')
    expect(vf).toContain('npl=203')
  })
  it('skips tone-mapping when turned off', () => {
    const vf = buildFilterGraph({ ...sdr, hdr: 'pq' }, { ...DEFAULT_OPTIONS, toneMap: false, platform: 'instagram' })
    expect(vf).not.toContain('tonemap')
  })
  it('crops in fill mode and pads in fit mode', () => {
    expect(buildFilterGraph(sdr, { ...DEFAULT_OPTIONS, platform: 'tiktok', fit: 'fill' })).toContain('crop=1080:1920')
    expect(buildFilterGraph(sdr, { ...DEFAULT_OPTIONS, platform: 'tiktok' })).toContain('pad=1080:1920')
  })
  it('adds clean-up filters only when asked', () => {
    const vf = buildFilterGraph(sdr, { ...DEFAULT_OPTIONS, platform: 'tiktok', denoise: true, deband: true, sharpen: true })
    expect(vf).toContain('hqdn3d')
    expect(vf).toContain('noise=alls=2')
    expect(vf).toContain('unsharp')
    expect(buildFilterGraph(sdr, { ...DEFAULT_OPTIONS, platform: 'tiktok' })).not.toMatch(/hqdn3d|noise=|unsharp/)
  })
})

describe('parseProbe', () => {
  it('reads an iPhone HDR clip with rotation', () => {
    const info = parseProbe({
      streams: [
        { codec_type: 'video', codec_name: 'hevc', width: 3840, height: 2160, pix_fmt: 'yuv420p10le',
          avg_frame_rate: '30/1', color_transfer: 'arib-std-b67', color_primaries: 'bt2020',
          side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }] },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
      format: { duration: '12.5' },
    })
    expect(info).toMatchObject({ width: 2160, height: 3840, hdr: 'hlg', bitDepth: 10, hasAudio: true, durationSec: 12.5 })
  })
  it('ignores cover art and rejects audio-only files', () => {
    expect(() => parseProbe({ streams: [{ codec_type: 'audio' }, { codec_type: 'video', width: 600, height: 600, disposition: { attached_pic: 1 } }] })).toThrow()
  })
})

describe('outputFileName', () => {
  it('names files per platform', () => {
    expect(outputFileName('My Clip.final.MOV', 'tiktok')).toBe('My Clip.final_tiktok.mp4')
  })
})

describe('variant options', () => {
  it('raises the H.264 level for 1440p and 4K', () => {
    const args = (scale: number) => buildFfmpegArgs(sdr, { ...DEFAULT_OPTIONS, platform: 'tiktok', resolutionScale: scale }, 'i', 'o')
    expect(args(1)[args(1).indexOf('-level:v') + 1]).toBe('4.2')
    expect(args(4 / 3)[args(4 / 3).indexOf('-level:v') + 1]).toBe('5.1')
    expect(args(2)[args(2).indexOf('-level:v') + 1]).toBe('5.2')
    expect(args(2).join(' ')).toContain('scale=2160:3840')
  })
  it('builds constant bitrate at the platform ceiling', () => {
    const args = buildFfmpegArgs(sdr, { ...DEFAULT_OPTIONS, platform: 'instagram', rateControl: 'cbr' }, 'i', 'o').join(' ')
    expect(args).toContain('-b:v 20000k -minrate 20000k -maxrate 20000k')
    expect(args).not.toContain('-crf')
  })
  it('encodes HEVC with a closed GOP and the hvc1 tag', () => {
    const args = buildFfmpegArgs(sdr, { ...DEFAULT_OPTIONS, platform: 'tiktok', codec: 'hevc', darkDetail: true }, 'i', 'o').join(' ')
    expect(args).toContain('-c:v libx265')
    expect(args).toContain('open-gop=0')
    expect(args).toContain('aq-mode=3')
    expect(args).toContain('-tag:v hvc1')
  })
  it('halves 59.94 to 29.97 when capped at 30 fps', () => {
    const args = buildFfmpegArgs({ ...sdr, frameRate: { num: 60000, den: 1001 } }, { ...DEFAULT_OPTIONS, platform: 'tiktok', maxFps: 30 }, 'i', 'o')
    expect(args.join(' ')).toContain('fps=30000/1001')
    expect(args[args.indexOf('-g') + 1]).toBe('60')
  })
})
