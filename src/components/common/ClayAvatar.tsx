import { useEffect, useRef, useState } from 'react'
import { getClayAvatarAssetPath, getClayAvatarViewport, type ClayAvatarConfig } from '../../utils/clayAvatar'
import { decodeImageAsset } from '../../utils/decodeImageAsset'

interface ClayAvatarProps {
  config: ClayAvatarConfig
  className?: string
  language?: string
  name: string
}

export function ClayAvatar({ config, className = '', language, name }: ClayAvatarProps) {
  const resolvedLanguage = language ?? (typeof document === 'undefined' ? 'zh' : document.documentElement.lang || navigator.language || 'zh')
  const ariaLabel = resolvedLanguage.toLowerCase().startsWith('ar')
    ? `صورة ${name} الكرتونية ثلاثية الأبعاد من الطين`
    : resolvedLanguage.toLowerCase().startsWith('en')
      ? `${name}'s 3D clay cartoon avatar`
      : `${name}的3D黏土卡通头像`

  const source = getClayAvatarAssetPath(config)
  const viewport = getClayAvatarViewport(config)
  const requestRef = useRef(0)
  const [displayed, setDisplayed] = useState<{ source: string, viewport: ReturnType<typeof getClayAvatarViewport> } | null>(null)

  useEffect(() => {
    const request = ++requestRef.current

    void decodeImageAsset(source, 'high').then(() => {
      if (request !== requestRef.current) return
      setDisplayed({ source, viewport })

    }).catch(() => {
      // Keep the last completely decoded avatar (or the stable placeholder).
    })

    return () => {
      requestRef.current += 1
    }
  }, [config.appearance, config.role, source, viewport.height, viewport.left, viewport.top, viewport.width])

  return (
    <span aria-busy={!displayed} className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-primary-soft ${className}`} role="img" aria-label={ariaLabel}>
      {displayed && (
        <img
          alt=""
          aria-hidden="true"
          className="absolute max-w-none object-cover motion-safe:animate-[avatar-swap_180ms_ease-out]"
          decoding="async"
          draggable={false}
          fetchPriority="high"
          key={displayed.source}
          src={displayed.source}
          style={displayed.viewport}
        />
      )}
    </span>
  )
}
