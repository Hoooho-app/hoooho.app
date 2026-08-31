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

export interface AvatarPhotoCropSelection {
  offsetX: number
  offsetY: number
  zoom: number
}

export interface AvatarPhotoPreview {
  height: number
  src: string
  width: number
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

export function getSquareCrop(width: number, height: number, selection: AvatarPhotoCropSelection = { offsetX: 0, offsetY: 0, zoom: 1 }) {
  const baseSide = Math.min(width, height)
  const zoom = Math.min(Math.max(selection.zoom, 1), 3)
  const side = baseSide / zoom
  const availableX = Math.max(width - side, 0)
  const availableY = Math.max(height - side, 0)
  const offsetX = Math.min(Math.max(selection.offsetX, -1), 1)
  const offsetY = Math.min(Math.max(selection.offsetY, -1), 1)
  return {
    sx: availableX * (offsetX + 1) / 2,
    sy: availableY * (offsetY + 1) / 2,
    side
  }
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

export async function createAvatarPhotoPreview(file: File): Promise<AvatarPhotoPreview> {
  if (!isSupportedAvatarPhoto(file)) throw new AvatarPhotoError('unsupported')
  let decoded: DecodedImage | null = null
  try {
    decoded = await decodePhoto(file)
    if (!decoded.width || !decoded.height) throw new AvatarPhotoError('unreadable')
    const scale = Math.min(1024 / Math.max(decoded.width, decoded.height), 1)
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new AvatarPhotoError('processing')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(decoded.source, 0, 0, width, height)
    const blob = await encodePreferred(canvas, 0.84)
    canvas.width = 1
    canvas.height = 1
    if (!blob) throw new AvatarPhotoError('processing')
    return { height: decoded.height, src: await blobToDataUrl(blob), width: decoded.width }
  } catch (error) {
    if (error instanceof AvatarPhotoError) throw error
    throw new AvatarPhotoError('processing')
  } finally {
    decoded?.release()
  }
}

export async function prepareAvatarPhoto(file: File, selection: AvatarPhotoCropSelection = { offsetX: 0, offsetY: 0, zoom: 1 }) {
  if (!isSupportedAvatarPhoto(file)) throw new AvatarPhotoError('unsupported')

  let decoded: DecodedImage | null = null
  try {
    decoded = await decodePhoto(file)
    if (!decoded.width || !decoded.height) throw new AvatarPhotoError('unreadable')
    const crop = getSquareCrop(decoded.width, decoded.height, selection)

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
