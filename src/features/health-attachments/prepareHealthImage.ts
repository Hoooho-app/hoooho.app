import type { CreateEventAttachmentInput } from '../../types'

export const HEALTH_IMAGE_MAX_SOURCE_BYTES = 25 * 1024 * 1024
export const HEALTH_IMAGE_TARGET_BYTES = 3 * 1024 * 1024
export const HEALTH_IMAGE_MAX_EDGE = 2560

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

export class HealthImagePreparationError extends Error {
  constructor(message: string) { super(message); this.name = 'HealthImagePreparationError' }
}

export function calculateHealthImageDimensions(width: number, height: number, maxEdge = HEALTH_IMAGE_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const isHeic = (file: Pick<File, 'name' | 'type'>) => /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)

async function decode(file: File) {
  if ('createImageBitmap' in globalThis) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* Safari may fall through. */ }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new HealthImagePreparationError(isHeic(file) ? '当前浏览器无法转换 HEIC/HEIF，请在系统相册中导出为 JPG 后重试' : '图片无法读取，请重新选择')) }
    image.src = url
  })
}

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new HealthImagePreparationError('图片处理失败'))
  reader.onerror = () => reject(new HealthImagePreparationError('图片处理失败'))
  reader.readAsDataURL(blob)
})

export async function prepareHealthImage(file: File): Promise<CreateEventAttachmentInput> {
  if (!supportedTypes.has(file.type.toLowerCase()) && !isHeic(file)) throw new HealthImagePreparationError('仅支持 JPG、PNG、WebP、HEIC 或 HEIF 图片')
  if (!file.size || file.size > HEALTH_IMAGE_MAX_SOURCE_BYTES) throw new HealthImagePreparationError('单张原图不能超过 25MB')
  const image = await decode(file)
  const sourceWidth = 'naturalWidth' in image ? image.naturalWidth : image.width
  const sourceHeight = 'naturalHeight' in image ? image.naturalHeight : image.height
  const dimensions = calculateHealthImageDimensions(sourceWidth, sourceHeight)
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width; canvas.height = dimensions.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new HealthImagePreparationError('当前浏览器无法处理图片')
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  if ('close' in image && typeof image.close === 'function') image.close()
  let quality = 0.9
  let blob = await canvasBlob(canvas, 'image/webp', quality) ?? await canvasBlob(canvas, 'image/jpeg', quality)
  while (blob && blob.size > HEALTH_IMAGE_TARGET_BYTES && quality > 0.5) {
    quality -= 0.08
    blob = await canvasBlob(canvas, blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg', quality)
  }
  canvas.width = 1; canvas.height = 1
  if (!blob || blob.size > HEALTH_IMAGE_TARGET_BYTES) throw new HealthImagePreparationError('图片压缩后仍过大，请裁剪后重试')
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg'
  return { name: file.name.replace(/\.[^.]+$/, '') + `.${extension}`, mimeType: blob.type, dataUrl: await dataUrl(blob) }
}
