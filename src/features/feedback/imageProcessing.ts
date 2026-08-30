export interface PendingFeedbackImage {
  id: string
  file: File
  name: string
  type: string
  previewUrl: string
  dataUrl: string | null
  size: number
  status: 'processing' | 'ready' | 'failed'
  error: string | null
}

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MAX_SOURCE_BYTES = 50 * 1024 * 1024
const TARGET_BYTES = 2 * 1024 * 1024
const MAX_EDGE = 2048

const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('无法读取图片'))
  reader.readAsDataURL(blob)
})

const loadImage = async (file: File) => {
  if ('createImageBitmap' in window) return createImageBitmap(file)
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally { URL.revokeObjectURL(url) }
}

const canvasBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片压缩失败')), 'image/jpeg', quality))

export async function processFeedbackImage(file: File): Promise<Omit<PendingFeedbackImage, 'id' | 'file' | 'previewUrl' | 'status' | 'error'>> {
  if (!allowedTypes.has(file.type.toLowerCase())) throw new Error('仅支持 JPG、PNG、WebP、HEIC 图片')
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error('这张原图过大，请换一张重试')
  let image: ImageBitmap | HTMLImageElement
  try { image = await loadImage(file) } catch { throw new Error(file.type.includes('heic') || file.type.includes('heif') ? '当前浏览器无法解码这张 HEIC 图片，请在系统相册中转为 JPG 后重试' : '图片无法读取，请换一张重试') }
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法处理图片')
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
  if ('close' in image && typeof image.close === 'function') image.close()
  let quality = 0.86, blob = await canvasBlob(canvas, quality)
  while (blob.size > TARGET_BYTES && quality > 0.46) { quality -= 0.1; blob = await canvasBlob(canvas, quality) }
  if (blob.size > TARGET_BYTES) throw new Error('图片压缩后仍超过 2MB，请裁剪后重试')
  return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', dataUrl: await toDataUrl(blob), size: blob.size }
}

export function revokeFeedbackImages(images: PendingFeedbackImage[]) { images.forEach((image) => URL.revokeObjectURL(image.previewUrl)) }
