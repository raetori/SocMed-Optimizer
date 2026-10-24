# Nova

**Video optimizer for TikTok, Instagram and Facebook, by [Creation of Cosmos](https://creationofcosmos.com/).**

Every platform re-encodes what you upload. Nova re-encodes your video *first*, to each
platform's exact ingest spec, so their compression does as little damage as possible. It runs
entirely in the browser with [ffmpeg.wasm](https://ffmpegwasm.netlify.app/): the video never
leaves the user's device, and hosting costs nothing.

## What it does

- Takes one video (up to 500 MB and 3 minutes for now) and outputs one MP4 per platform:
  TikTok, Instagram Reels, Facebook Reels (1080×1920) and Facebook feed (1920×1080).
- Downscales 4K with Lanczos, keeps the source frame rate when it's 23 to 60 fps (120 fps
  becomes 60, anything under 23 becomes 30), and converts variable frame rate to constant.
- Encodes H.264 High 4.2, CRF 17, closed 2-second GOP, VBV capped under Meta's 25 Mbps
  ingest ceiling, BT.709 tagged, AAC 48 kHz, `moov` first, no edit lists.
- Converts iPhone HDR (HLG or PQ) to SDR with the Hable tone-mapper Meta uses for Reels, with
  an adjustable brightness.
- Optional clean-up: denoise, anti-banding grain, light sharpen.
- Strips location and camera metadata.
- Shows each platform's posting tips next to the download.

The settings come from the phase 1 research report. They have been checked against each
platform's published spec with real ffmpeg, but **not yet measured on real uploads**. That's
the next step.

## Test pack

Switch step 2 to **Test pack** to export one short clip up to ten ways for one platform. Each
version changes one thing from the baseline, and its letter is in the file name:

| | Version | Question it answers |
| --- | --- | --- |
| A | Baseline | Nova's standard preset (CRF 17, platform bitrate cap) |
| B | Max quality | Does CRF 12 survive better, or is it thrown away? |
| C | Lean | Is a half-bitrate file treated the same? |
| D | Constant bitrate | Does high CBR beat variable bitrate? |
| E | 1440p | Does a bigger upload get a sharper encode ladder? |
| F | Pre-sharpened + grain | Does sharpening and grain survive the platform's scaler? |
| G | Denoised + dark detail | Does removing noise free bits for real detail? |
| H | HEVC (H.265) | Does HEVC change what the platform serves? |
| I | 4K (TikTok only) | Does TikTok serve 4K uploads sharper? |
| J | 30 fps (60 fps sources only) | Is 60 fps better posted at 30, with twice the bits per frame? |

**Download all** gives a zip with every file, `results.csv` (with blank columns for the
link, a 1 to 5 score and notes) and a `README.txt` with the posting steps. Test packs are
limited to 60 seconds; 10-second clips are ideal.

## Content profiles

"What's in this clip?" sets the clean-up filters for footage that predictably breaks after
upload, and shows what to fix before export. The full text is in `src/lib/profiles.ts`.

| Profile | What goes wrong | What Nova does |
| --- | --- | --- |
| Low light / grainy | Noise eats the bitrate and turns to mush | Denoise + dark detail (`aq-mode=3`) |
| Fast motion / sports | Pans and action smear and block | CRF 15, keep up to 60 fps |
| Busy detail | Leaves, water, confetti go soft or shimmer | CRF 15, no denoise |
| Skies & gradients | Banding stripes in 8-bit | Fine grain + dark detail |
| Dark / moody grade | Blocky shadows, flat crushed blacks | Dark detail + fine grain |
| Text, graphics, screens | Soft edges, fuzzy colored text | Light sharpen |
| Talking head / skin | Harsh or waxy skin | No sharpening, dark detail |

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests for the presets and probe parsing
npm run verify-presets # encodes synthetic clips with native ffmpeg and checks every preset
npm run build          # static site in dist/
```

`verify-presets` needs `ffmpeg` and `ffprobe` on your PATH. CI runs all three.

### Where the ffmpeg engine loads from

The ffmpeg core (about 32 MB of WebAssembly) loads from jsDelivr by default and is cached
by the browser after the first visit. To run without the CDN (offline, tests, or
self-hosting), copy it into `public/cdn` and point the app at it:

```bash
npm run vendor-core
VITE_FFMPEG_CORE_BASE=/cdn npm run dev
```

Cloudflare Pages rejects files over 25 MiB, so keep the CDN default there.

### Multi-threading

When the page is cross-origin isolated (the `COOP`/`COEP` headers in `public/_headers`,
`vercel.json` and `vite.config.ts`), Nova uses the multi-threaded core, which encoded about
twice as fast in testing. It caps ffmpeg at 2 to 4 threads, because automatic thread counts
crashed the WebAssembly thread pool. If a multi-threaded encode fails anyway, Nova retries
once on the single-threaded core. Set `VITE_FFMPEG_SINGLE_THREAD=1` to force single-threaded.

## Deploy (free)

**Cloudflare Pages:** connect the repo, build command `npm run build`, output directory
`dist`. `public/_headers` sets the isolation headers.

**Vercel:** import the repo; it detects Vite. `vercel.json` sets the isolation headers.

## Code map

| File | What it does |
| --- | --- |
| `src/lib/presets.ts` | Platform specs and the ffmpeg arguments for each one. Pure, unit tested. |
| `src/lib/probe.ts` | Reads ffprobe JSON: display size after rotation, frame rate, HDR, audio. |
| `src/lib/engine.ts` | ffmpeg.wasm wrapper: load, probe, encode with progress, cancel, fallback. |
| `src/App.tsx` | The single-page UI. |
| `src/index.css` | Brand tokens (top of file) and styles. |
| `scripts/verify-presets.ts` | Native ffmpeg check of every preset against the platform specs. |
