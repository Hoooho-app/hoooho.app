import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const manifest = JSON.parse(await readFile('public/food-icons/manifest.json', 'utf8'))
assert.equal(manifest.length, 16)
const totals = { 96: 0, 144: 0 }
for (const size of [96, 144]) {
  assert.equal((await readdir(`public/food-icons/webp-${size}`)).length, 16)
  for (const icon of manifest) {
    const { path, bytes } = icon.files[size]
    assert.match(path, new RegExp(`^webp-${size}/${icon.id}\\.[a-f0-9]{10}\\.webp$`))
    const data = await readFile(`public/food-icons/${path}`)
    const metadata = await sharp(data).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, size)
    assert.equal(metadata.height, size)
    assert.ok(metadata.hasAlpha, `${path} must preserve transparency`)
    assert.ok((await sharp(data).ensureAlpha().stats()).channels[3].min === 0, `${path} needs transparent pixels`)
    assert.equal(data.length, bytes)
    assert.ok(data.length < 10 * 1024)
    assert.ok(path.includes(createHash('sha256').update(data).digest('hex').slice(0, 10)))
    totals[size] += bytes
  }
}
assert.ok(totals[96] < 60 * 1024)
assert.ok(totals[144] < 90 * 1024)
console.log(JSON.stringify({ icons: manifest.length, totalBytes: totals, transparency: 'PASS', sizes: 'PASS' }))
