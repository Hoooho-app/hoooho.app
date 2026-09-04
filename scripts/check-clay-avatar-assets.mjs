import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const assetDirectory = path.join(root, 'public', 'avatars', 'clay', 'v1')
const files = (await readdir(assetDirectory)).filter((file) => /\.(?:png|webp|jpe?g)$/i.test(file)).sort()
const webpFiles = files.filter((file) => file.endsWith('.webp'))
const legacyFiles = files.filter((file) => !file.endsWith('.webp'))

assert.equal(webpFiles.length, 24, 'Expected the 24 unchanged adult and elder clay avatar presets.')
assert.deepEqual(legacyFiles, [], `Unoptimized avatar assets remain: ${legacyFiles.join(', ')}`)

let totalBytes = 0
let largest = { file: '', bytes: 0 }
for (const file of webpFiles) {
  assert.match(file, /^.+\.[a-f0-9]{10}\.webp$/, `${file} must contain a content hash.`)
  const filePath = path.join(assetDirectory, file)
  const bytes = (await stat(filePath)).size
  const metadata = await sharp(filePath).metadata()
  assert.equal(metadata.format, 'webp', `${file} must be WebP.`)
  assert.equal(metadata.width, 512, `${file} must be 512px wide.`)
  assert.equal(metadata.height, 512, `${file} must be 512px tall.`)
  assert.equal(metadata.hasAlpha, true, `${file} must retain transparent corners.`)
  assert.ok(bytes <= 80 * 1024, `${file} exceeds the 80 KiB complete-avatar budget.`)
  totalBytes += bytes
  if (bytes > largest.bytes) largest = { file, bytes }
}

const generatedSource = await readFile(path.join(root, 'src', 'generated', 'clayAvatarAssets.ts'), 'utf8')
for (const file of webpFiles) assert.ok(generatedSource.includes(file), `${file} is absent from the generated asset map.`)
assert.ok(totalBytes <= 24 * 80 * 1024, 'The adult avatar pack exceeds its aggregate budget.')

console.log(JSON.stringify({
  count: webpFiles.length,
  totalKiB: Number((totalBytes / 1024).toFixed(1)),
  averageKiB: Number((totalBytes / webpFiles.length / 1024).toFixed(1)),
  largest: { file: largest.file, sizeKiB: Number((largest.bytes / 1024).toFixed(1)) }
}, null, 2))
