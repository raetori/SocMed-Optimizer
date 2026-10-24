// Copies the ffmpeg.wasm cores from node_modules into public/cdn so the app can
// run without the jsDelivr CDN (offline dev, tests, or self-hosting).
// Use with VITE_FFMPEG_CORE_BASE=/cdn.
import { cpSync, readFileSync } from 'node:fs'

for (const pkg of ['core', 'core-mt']) {
  const { version } = JSON.parse(readFileSync(`node_modules/@ffmpeg/${pkg}/package.json`, 'utf8'))
  cpSync(`node_modules/@ffmpeg/${pkg}/dist/esm`, `public/cdn/@ffmpeg/${pkg}@${version}/dist/esm`, { recursive: true })
  console.log(`public/cdn/@ffmpeg/${pkg}@${version}`)
}
