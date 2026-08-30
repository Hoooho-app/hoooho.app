import {
  AVATAR_PHOTO_MAX_BINARY_BYTES,
  AVATAR_PHOTO_MAX_DATA_URL_LENGTH,
  AVATAR_PHOTO_OUTPUT_STEPS
} from '../../shared/avatar-photo-policy.mjs'

const browserInputTypes = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
])
const supportedExtensions = /\.(?:jpe?g|png|webp|heic|heif)$/i
const heicExtensions = /\.(?:heic|heif)$/i

type DecodedImage = {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

export type AvatarPhotoFailure = 'unsupported' | 'unreadable' | 'processing'

export class AvatarPhotoError extends Error {
  readonly reason: AvatarPhotoFailure

  constructor(reason: AvatarPhotoFailure) {
    super(reason)
    this.name = 'AvatarPhotoError'
    this.reason = reason
  }
}

function isHeic(file: File) {
  return file.type === 'image/heic' || file.type === 'image/heif' || heicExtensions.test(file.name)
}

export function isSupportedAvatarPhoto(file: Pick<File, 'name' | 'type'>) {
  return browserInputTypes.has(file.type.toLowerCase()) || (!file.type && supportedExtensions.test(file.name))
}

export function getCenteredSquareCrop(width: number, height: number) {
  const side = Math.min(width, height)
  return { sx: (width - side) / 2, sy: (height - side) / 2, side }
}

async function decodePhoto(file: File): Promise<DecodedImage> {
  if ('createImageBitmap' in globalThis) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close()
      }
    } catch {
      // Some Safari versions can decode formats through HTMLImageElement only.
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image()
    const source = URL.createObjectURL(file)
    const releaseUrl = () => URL.revokeObjectURL(source)
    image.onload = () => {
      releaseUrl()
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => { image.src = '' }
      })
    }
    image.onerror = () => {
      releaseUrl()
      reject(new AvatarPhotoError(isHeic(file) ? 'unsupported' : 'unreadable'))
    }
    image.src = source
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new AvatarPhotoError('processing'))
    reader.onerror = () => reject(new AvatarPhotoError('processing'))
    reader.readAsDataURL(blob)
  })
}

async function encodePreferred(canvas: HTMLCanvasElement, quality: number) {
  const webp = await canvasToBlob(canvas, 'image/webp', quality)
  if (webp?.type === 'image/webp') return webp
  return canvasToBlob(canvas, 'image/jpeg', quality)
}

export async function prepareAvatarPhoto(file: File) {
  if (!isSupportedAvatarPhoto(file)) throw new AvatarPhotoError('unsupported')

  let decoded: DecodedImage | null = null
  try {
    decoded = await decodePhoto(file)
    if (!decoded.width || !decoded.height) throw new AvatarPhotoError('unreadable')
    const crop = getCenteredSquareCrop(decoded.width, decoded.height)

    for (const step of AVATAR_PHOTO_OUTPUT_STEPS) {
      const canvas = document.createElement('canvas')
      canvas.width = step.size
      canvas.height = step.size
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new AvatarPhotoError('processing')

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, step.size, step.size)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(decoded.source, crop.sx, crop.sy, crop.side, crop.side, 0, 0, step.size, step.size)

      const blob = await encodePreferred(canvas, step.quality)
      canvas.width = 1
      canvas.height = 1
      if (!blob || blob.size > AVATAR_PHOTO_MAX_BINARY_BYTES) continue

      const dataUrl = await blobToDataUrl(blob)
      if (dataUrl.length <= AVATAR_PHOTO_MAX_DATA_URL_LENGTH) return dataUrl
    }
    throw new AvatarPhotoError('processing')
  } catch (error) {
    if (error instanceof AvatarPhotoError) throw error
    throw new AvatarPhotoError('processing')
  } finally {
    decoded?.release()
  }
}
