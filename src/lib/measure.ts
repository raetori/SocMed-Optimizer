// Measures what a platform actually served, by reading the file the user saved
// back from the post. Specs come from the same ffmpeg probe the optimizer uses;
// the similarity score compares sampled frames of the served copy against the
// original export, entirely in the browser.

import type { SourceInfo } from './probe'
import { engine } from './engineSingleton'

export interface Measured extends SourceInfo {
  sizeBytes: number
  /** Average bitrate from size and duration, a floor when the container omits it. */
  effectiveBitrate: number
}

export async function measure(file: File): Promise<Measured> {
  const info = await engine.probe(file)
  const effectiveBitrate =
    info.bitrate && info.bitrate > 0
      ? info.bitrate
      : info.durationSec > 0
        ? Math.round((file.size * 8) / info.durationSec)
        : 0
  return { ...info, sizeBytes: file.size, effectiveBitrate }
}

/** Decodes `count` evenly spaced frames to a small grayscale buffer for comparison. */
async function sampleFrames(file: File, count: number, w: number, h: number): Promise<Float64Array[]> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('Could not decode this video in the browser.'))
    })
    const duration = video.duration
    if (!(duration > 0)) throw new Error('This video has no readable duration.')
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const frames: Float64Array[] = []
    for (let i = 0; i < count; i++) {
      const t = (duration * (i + 0.5)) / count
      await seek(video, t)
      ctx.drawImage(video, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)
      const gray = new Float64Array(w * h)
      for (let p = 0; p < gray.length; p++) {
        gray[p] = 0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2]
      }
      frames.push(gray)
    }
    return frames
  } finally {
    video.src = ''
    URL.revokeObjectURL(url)
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener('seeked', done)
      resolve()
    }
    video.addEventListener('seeked', done)
    video.onerror = () => reject(new Error('Could not read a frame from this video.'))
    video.currentTime = Math.min(t, (video.duration || t) - 0.01)
  })
}

export interface Similarity {
  /** 0 to 100: a rough visual-fidelity score of the served copy against the original. */
  score: number
  psnr: number
}

/**
 * Compares the served copy against the original by sampling matched frames and
 * computing PSNR. Both come from the same edit, so evenly spaced timestamps line
 * up without explicit alignment. This is an in-browser approximation, not VMAF.
 */
export async function compareQuality(original: File, served: File): Promise<Similarity> {
  const W = 320
  const H = 180
  const N = 12
  const [a, b] = await Promise.all([sampleFrames(original, N, W, H), sampleFrames(served, N, W, H)])
  let mse = 0
  let n = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    for (let p = 0; p < a[i].length; p++) {
      const d = a[i][p] - b[i][p]
      mse += d * d
      n++
    }
  }
  mse = n ? mse / n : 0
  const psnr = mse <= 0 ? 99 : 10 * Math.log10((255 * 255) / mse)
  // Map PSNR to a friendly 0-100 score: ~30 dB is visibly degraded, ~45 dB is near-transparent.
  const score = Math.max(0, Math.min(100, Math.round(((psnr - 25) / 20) * 100)))
  return { score, psnr }
}
