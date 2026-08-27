const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxSourceBytes = 8 * 1024 * 1024
const outputSize = 256
const maxDataUrlLength = 300_000

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const source = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(source)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(source)
      reject(new Error('无法读取这张照片，请选择 JPG、PNG 或 WebP 图片'))
    }
    image.src = source
  })
}

export async function prepareAvatarPhoto(file: File) {
  if (!acceptedTypes.has(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片')
  if (file.size > maxSourceBytes) throw new Error('照片不能超过 8MB')

  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法处理照片')

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight)
  const sourceX = (image.naturalWidth - cropSize) / 2
  const sourceY = (image.naturalHeight - cropSize) / 2
  context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, outputSize, outputSize)

  const dataUrl = canvas.toDataURL('image/webp', 0.82)
  if (!dataUrl.startsWith('data:image/webp;base64,') || dataUrl.length > maxDataUrlLength) {
    throw new Error('照片处理后仍然过大，请选择另一张照片')
  }
  return dataUrl
}
