import { getClayAvatarAssetPath, getClayAvatarViewport, type ClayAvatarConfig } from '../../utils/clayAvatar'

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
  return (
    <span className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-primary-soft ${className}`} role="img" aria-label={ariaLabel}>
      <img
        alt=""
        aria-hidden="true"
        className="absolute max-w-none object-cover motion-safe:animate-[avatar-swap_180ms_ease-out]"
        draggable={false}
        key={source}
        src={source}
        style={viewport}
      />
    </span>
  )
}
