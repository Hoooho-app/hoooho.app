import { createHash } from 'node:crypto'
import sharp from 'sharp'

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const MAX_HEALTH_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_HEALTH_IMAGE_PIXELS = 40_000_000

function attachmentError(message, status, code) {
  return Object.assign(new Error(message), { status, code })
}

function detectedMimeType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

export async function validateHealthImage(input) {
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 160) : ''
  const mimeType = typeof input?.mimeType === 'string' ? input.mimeType.toLowerCase() : ''
  const dataUrl = typeof input?.dataUrl === 'string' ? input.dataUrl : ''
  if (!name) throw attachmentError('附件名称不能为空', 400, 'INVALID_ATTACHMENT_NAME')
  if (/image\/hei[cf]/.test(mimeType)) throw attachmentError('当前环境无法安全处理 HEIC/HEIF，请在系统相册中转换为 JPG 后重试', 415, 'HEIC_CONVERSION_REQUIRED')
  if (!allowedMimeTypes.has(mimeType)) throw attachmentError('仅支持 JPG、PNG 或 WebP 图片', 415, 'INVALID_ATTACHMENT_TYPE')
  const prefix = `data:${mimeType};base64,`
  if (!dataUrl.startsWith(prefix)) throw attachmentError('图片内容格式错误', 400, 'INVALID_ATTACHMENT_DATA')
  let buffer
  try { buffer = Buffer.from(dataUrl.slice(prefix.length), 'base64') } catch { throw attachmentError('图片无法读取，请重新选择', 400, 'INVALID_ATTACHMENT_DATA') }
  if (!buffer.length) throw attachmentError('图片内容为空', 400, 'INVALID_ATTACHMENT_DATA')
  if (buffer.length > MAX_HEALTH_IMAGE_BYTES) throw attachmentError('图片处理后仍超过 5MB，请裁剪后重试', 413, 'ATTACHMENT_TOO_LARGE')
  if (detectedMimeType(buffer) !== mimeType) throw attachmentError('图片格式与文件内容不一致', 415, 'ATTACHMENT_MIME_MISMATCH')
  let metadata
  try { metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: MAX_HEALTH_IMAGE_PIXELS }).metadata() } catch {
    throw attachmentError('图片损坏或像素尺寸异常，请换一张重试', 422, 'ATTACHMENT_DECODE_FAILED')
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_HEALTH_IMAGE_PIXELS) {
    throw attachmentError('图片像素尺寸过大，请缩小后重试', 413, 'ATTACHMENT_PIXEL_LIMIT')
  }
  return {
    name, mimeType, dataUrl, binarySize: buffer.length,
    width: metadata.width, height: metadata.height,
    contentHash: createHash('sha256').update(buffer).digest('hex')
  }
}
