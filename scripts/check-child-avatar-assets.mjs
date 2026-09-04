import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const assetDirectory = path.join(root, 'public', 'avatars', 'children', 'v1')
const files = (await readdir(assetDirectory)).filter((file) => file.endsWith('.webp')).sort()
const variants = ['east-asian', 'european', 'african']
const expectedIds = ['boy', 'girl'].flatMap((gender) => (
  Array.from({ length: 8 }, (_, age) => variants.map((variant) => `${gender}-age${age}-${variant}`))
)).flat().sort()
const actualIds = files.map((file) => file.replace(/\.[a-f0-9]{10}\.webp$/, '')).sort()

assert.equal(files.length, 48, 'Expected exactly 48 final child avatars.')
assert.deepEqual(actualIds, expectedIds, 'Every age, gender, and variant must exist exactly once.')
assert.equal(files.filter((file) => file.startsWith('girl-')).length, 24, 'Expected 24 girl avatars.')
assert.equal(files.filter((file) => file.startsWith('boy-')).length, 24, 'Expected 24 boy avatars.')

let minBytes = Number.POSITIVE_INFINITY
let maxBytes = 0
for (const file of files) {
  assert.match(file, /^(?:girl|boy)-age[0-7]-(?:east-asian|european|african)\.[a-f0-9]{10}\.webp$/)
  const filePath = path.join(assetDirectory, file)
  const bytes = (await stat(filePath)).size
  const metadata = await sharp(filePath).metadata()
  assert.equal(metadata.format, 'webp', `${file} must be WebP.`)
  assert.equal(metadata.width, 256, `${file} must be 256px wide.`)
  assert.equal(metadata.height, 256, `${file} must be 256px tall.`)
  assert.ok(bytes >= 20 * 1024 && bytes <= 60 * 1024, `${file} must be between 20 and 60 KiB.`)
  const { data, info } = await sharp(filePath).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const cornerOffsets = [
    0,
    (info.width - 1) * info.channels,
    (info.height - 1) * info.width * info.channels,
    ((info.height * info.width) - 1) * info.channels
  ]
  for (const offset of cornerOffsets) {
    const corner = Array.from(data.subarray(offset, offset + info.channels))
    assert.ok(corner.every((channel) => channel >= 245), `${file} must have a visually pure-white background at every corner.`)
  }
  minBytes = Math.min(minBytes, bytes)
  maxBytes = Math.max(maxBytes, bytes)
}

const generatedSource = await readFile(path.join(root, 'src', 'generated', 'childAvatarAssets.ts'), 'utf8')
for (const file of files) assert.ok(generatedSource.includes(file), `${file} is absent from the generated asset map.`)

const legacyChildFiles = (await readdir(path.join(root, 'public', 'avatars', 'clay', 'v1')))
  .filter((file) => /^(?:baby-|toddler-)?(?:boy|girl)-/.test(file) && file.endsWith('.webp'))
assert.deepEqual(legacyChildFiles, [], `Legacy child clay avatars remain: ${legacyChildFiles.join(', ')}`)

console.log(JSON.stringify({ count: files.length, boys: 24, girls: 24, minBytes, maxBytes }, null, 2))
