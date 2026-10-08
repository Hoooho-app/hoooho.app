const maxBytes = 20 * 1024 * 1024
const targetBytes = 1024 * 1024
const read = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('照片无法读取'))
  reader.onerror = () => reject(new Error('照片无法读取'))
  reader.readAsDataURL(blob)
})
async function decode(source: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(source, { imageOrientation: 'from-image' }) } catch { /* Safari uses native image decoding. */ }
  }
  const url = URL.createObjectURL(source)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('照片无法读取，请重新拍摄'))
      image.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}
export async function prepareFoodLabelPhoto(file: File): Promise<{ dataUrl: string }> {
  if (!file.size || file.size > maxBytes) throw new Error('单张照片须小于20MB，请重新拍摄')
  const type = file.type.toLowerCase() || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif' }[file.name.split('.').pop()?.toLowerCase() ?? ''])
  if (!type || !/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(type)) throw new Error('照片格式无法读取，请重新拍摄')
  const source = new Blob([file], { type })
  let image: ImageBitmap | HTMLImageElement
  try { image = await decode(source) } catch (error) {
    // Only small HEIC originals may use the existing server decoder.
    if (/image\/hei[cf]/.test(type) && source.size <= targetBytes) return { dataUrl: await read(source) }
    throw error
  }
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height
  const canvas = document.createElement('canvas')
  try {
    if (!width || !height || width * height > 40_000_000) throw new Error('照片尺寸过大，请重新拍摄')
    const scale = Math.min(1, 2560 / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('照片处理未完成，请重试')
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.86, 0.8, 0.74, 0.68]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= targetBytes) return { dataUrl: await read(blob) }
    }
    throw new Error('照片压缩后仍过大，请裁剪配料表后重试')
  } finally {
    canvas.width = canvas.height = 1
    if ('close' in image) image.close()
  }
}
