import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const base = process.env.BODY_BASE_URL
assert.ok(['https://hooohoapp-staging.up.railway.app', 'https://hoooho.com'].includes(base), 'Use the verified Staging or Production URL')
const get = async path => {
  const response = await fetch(new URL(path, base), { cache: 'no-store' })
  assert.equal(response.status, 200, path)
  return response
}
for (const path of ['/', '/health-events', '/api/health']) await get(path)
const html = await (await get('/')).text()
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))(?:\?[^\"]*)?"/g)].map(match => match[1])
assert.ok(assets.some(path => path.endsWith('.js')))
for (const asset of assets) {
  const response = await get(asset)
  assert.match(response.headers.get('content-type') || '', asset.endsWith('.js') ? /javascript/ : /text\/css/)
}
const manifest = JSON.parse(await readFile('src/features/body-location/child-data/source-manifest.json', 'utf8'))
const images = manifest.files.filter(file => file.path.startsWith('assets/'))
assert.equal(images.length, 10)
for (const file of images) {
  const response = await get(file.path.replace('assets/', '/body-locator/v1/'))
  assert.match(response.headers.get('content-type') || '', /image\/png/)
  assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), file.sha256, file.path)
}
console.log(JSON.stringify({ base, health: 'PASS', entryAssets: assets, frozenImages: images.length, hashes: 'PASS' }, null, 2))
