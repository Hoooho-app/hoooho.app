const decodedAssets = new Map<string, Promise<void>>()

export type ImageFetchPriority = 'high' | 'low' | 'auto'

export function decodeImageAsset(source: string, priority: ImageFetchPriority = 'auto') {
  const cached = decodedAssets.get(source)
  if (cached) return cached

  const request = new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = priority
    image.onload = async () => {
      try {
        await image.decode?.()
      } catch {
        // Older Safari versions can reject decode() after a successful load.
        // A complete image with intrinsic dimensions is still safe to paint.
        if (!image.complete || image.naturalWidth === 0) {
          reject(new Error(`Could not decode image: ${source}`))
          return
        }
      }
      resolve()
    }
    image.onerror = () => reject(new Error(`Could not load image: ${source}`))
    image.src = source
  }).catch((error) => {
    decodedAssets.delete(source)
    throw error
  })

  decodedAssets.set(source, request)
  return request
}

export function clearDecodedImageAssetCache() {
  decodedAssets.clear()
}
