import { useEffect, useRef } from 'react'
import { clayAvatarAssetManifest, getClayAvatarCells, type ClayAvatarConfig } from '../../utils/clayAvatar'

interface ClayAvatarProps {
  config: ClayAvatarConfig
  className?: string
  language?: string
  name: string
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()
const cellCache = new Map<string, Promise<HTMLCanvasElement>>()

function loadImage(source: string) {
  const cached = imageCache.get(source)
  if (cached) return cached
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load clay avatar source: ${source}`))
    image.src = source
  })
  imageCache.set(source, loading)
  return loading
}

function transparentCell(source: string, columns: number, rows: number, column: number, row: number) {
  const key = `${source}:${columns}:${rows}:${column}:${row}`
  const cached = cellCache.get(key)
  if (cached) return cached
  const processing = loadImage(source).then((image) => {
    const sourceWidth = image.naturalWidth / columns
    const sourceHeight = image.naturalHeight / rows
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sourceWidth)
    canvas.height = Math.round(sourceHeight)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return canvas
    context.drawImage(image, column * sourceWidth, row * sourceHeight, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index]
      const green = pixels.data[index + 1]
      const blue = pixels.data[index + 2]
      const lightest = Math.max(red, green, blue)
      const darkest = Math.min(red, green, blue)
      if (darkest > 235 && lightest - darkest < 12) pixels.data[index + 3] = 0
    }
    context.putImageData(pixels, 0, 0)
    return canvas
  })
  cellCache.set(key, processing)
  return processing
}

export function ClayAvatar({ config, className = '', language, name }: ClayAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const resolvedLanguage = language ?? (typeof document === 'undefined' ? 'zh' : document.documentElement.lang || navigator.language || 'zh')
  const ariaLabel = resolvedLanguage.toLowerCase().startsWith('ar')
    ? `صورة ${name} الكرتونية ثلاثية الأبعاد من الطين`
    : resolvedLanguage.toLowerCase().startsWith('en')
      ? `${name}'s 3D clay cartoon avatar`
      : `${name}的3D黏土卡通头像`

  useEffect(() => {
    let active = true
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const cells = getClayAvatarCells(config)
    const { sources, grids } = clayAvatarAssetManifest
    Promise.all([
      transparentCell(sources.faces, grids.faces.columns, grids.faces.rows, cells.face.column, cells.face.row),
      transparentCell(sources.outfits, grids.outfits.columns, grids.outfits.rows, cells.outfit.column, cells.outfit.row),
      transparentCell(sources.hair, grids.hair.columns, grids.hair.rows, cells.hair.column, cells.hair.row)
    ]).then(([face, outfit, hair]) => {
      if (!active) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.save()
      context.beginPath()
      context.arc(128, 128, 128, 0, Math.PI * 2)
      context.clip()
      context.drawImage(face, 14, 6, 228, 228)
      context.drawImage(outfit, 4, 118, 248, 248)
      context.drawImage(hair, 8, 0, 240, 240)
      context.restore()
    }).catch(() => undefined)
    return () => { active = false }
  }, [config])

  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full bg-primary-soft ${className}`} role="img" aria-label={ariaLabel}>
      <canvas aria-hidden="true" className="h-full w-full" height={256} ref={canvasRef} width={256} />
    </span>
  )
}
