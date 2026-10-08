import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

async function walk(dir) {
  const files = []
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = `${dir}/${item.name}`
    if (item.isDirectory()) files.push(...await walk(file))
    else files.push(file)
  }
  return files
}
let count = 0, bytes = 0
for (const file of [...await walk('public'), ...await walk('src/assets')]) {
  const match = /\.([a-f0-9]{10})\.webp$/.exec(file)
  if (!match) continue
  const data = await readFile(file)
  assert.equal(createHash('sha256').update(data).digest('hex').slice(0, 10), match[1], `${file} cache hash`)
  const budget = file.includes('/avatars/') ? 16 * 1024 : file.includes('/body-locator/') ? 200 * 1024 : 80 * 1024
  assert.ok(data.length <= budget, `${file} exceeds mobile image budget`)
  count++; bytes += data.length
}
const source = await readFile('src/generated/optimizedPublicImages.ts', 'utf8')
const paths = JSON.parse(source.slice(source.indexOf('=') + 1))
for (const [original, output] of Object.entries(paths)) {
  const before = await sharp(`public${original}`).metadata(), after = await sharp(`public${output}`).metadata()
  assert.equal(after.format, 'webp')
  if (original.startsWith('/body-locator/')) {
    assert.equal(after.width, before.width); assert.equal(after.height, before.height)
  }
}
console.log(JSON.stringify({ optimizedImages: count, totalBytes: bytes, coordinateChecks: 'PASS', budgets: 'PASS' }))
