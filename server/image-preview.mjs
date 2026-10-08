import sharp from 'sharp'
import { createHash } from 'node:crypto'

const previews = new Map()

/** Call after ownership validation. Original clinical images are never overwritten. */
export async function imagePreview(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.mimeType)) return file
  const key = createHash('sha256').update(file.buffer).digest('hex')
  if (previews.has(key)) return previews.get(key)
  for (const width of [640, 480, 320]) {
    const buffer = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
      .rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76, effort: 3 }).toBuffer()
    if (buffer.length <= 80 * 1024) {
      const result = { buffer, mimeType: 'image/webp' }
      previews.set(key, result)
      if (previews.size > 64) previews.delete(previews.keys().next().value)
      return result
    }
  }
  throw new Error('图片缩略图暂不可用，请打开原件')
}
