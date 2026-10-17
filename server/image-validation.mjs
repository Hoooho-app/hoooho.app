import sharp from 'sharp'

const imageFormats = new Map([
  ['image/jpeg', 'jpeg'], ['image/png', 'png'], ['image/webp', 'webp'],
  ['image/gif', 'gif'], ['image/heic', 'heif'], ['image/heif', 'heif'], ['image/avif', 'heif']
])

// Metadata alone can accept a truncated file. Force pixel decoding as well,
// retaining original bytes and bounding both input pixels and decoded output.
export async function validateRasterImage(buffer, mimeType, maxPixels = 40_000_000) {
  const expectedFormat = imageFormats.get(mimeType)
  if (!Buffer.isBuffer(buffer) || !buffer.length || !expectedFormat) throw new Error('Unsupported image content')
  const image = sharp(buffer, { failOn: 'error', limitInputPixels: maxPixels, animated: true })
  const metadata = await image.metadata()
  if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels) {
    throw new Error('Invalid image format or dimensions')
  }
  await image.resize({ width: 1, height: 1, fit: 'inside' }).raw().toBuffer()
  return metadata
}
