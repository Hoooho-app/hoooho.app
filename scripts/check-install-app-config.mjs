import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const htmlPath = resolve(root, 'dist/index.html')
const manifestPath = resolve(root, 'dist/manifest.webmanifest')

assert.equal(existsSync(htmlPath), true, 'dist/index.html must exist before checking the install contract')
assert.equal(existsSync(manifestPath), true, 'dist/manifest.webmanifest must be emitted')

const html = readFileSync(htmlPath, 'utf8')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const entryMatch = html.match(/src="\/(assets\/index-[A-Za-z0-9_-]+\.js)"/)

assert.match(html, /rel="manifest"/i)
assert.match(html, /rel="apple-touch-icon"[^>]+href="\/icons\/apple-touch-icon\.png"/i)
assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/i)
assert.match(html, /name="apple-mobile-web-app-title" content="Hoooho"/i)
assert.equal(manifest.name, 'Hoooho')
assert.equal(manifest.short_name, 'Hoooho')
assert.equal(manifest.start_url, '/health-events')
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.theme_color, '#1B7A6E')
assert.equal(manifest.background_color, '#F5F8F6')

for (const expected of [
  ['/icons/app-icon-192.png', '192x192', 'any'],
  ['/icons/app-icon-512.png', '512x512', 'any'],
  ['/icons/app-icon-maskable-512.png', '512x512', 'maskable']
]) {
  const icon = manifest.icons.find((candidate) => candidate.src === expected[0])
  assert.ok(icon, `manifest icon ${expected[0]} must exist`)
  assert.equal(icon.sizes, expected[1])
  assert.equal(icon.purpose, expected[2])
  assert.equal(existsSync(resolve(root, 'dist', expected[0].slice(1))), true, `${expected[0]} must be emitted`)
}

assert.equal(existsSync(resolve(root, 'dist/icons/apple-touch-icon.png')), true, 'Apple touch icon must be emitted')
assert.equal(existsSync(resolve(root, 'dist/sw.js')), true, 'service worker must be emitted')
assert.ok(entryMatch, 'versioned app entry must be emitted')
const entry = readFileSync(resolve(root, 'dist', entryMatch[1]), 'utf8')
assert.match(entry, /["']\/sw\.js["'].*scope:["']\/["']/s, 'app entry must register the emitted service worker')

console.log('Install app build contract OK')
