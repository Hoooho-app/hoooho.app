interface AvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizes = { sm: 'h-9 w-9 text-sm', md: 'h-11 w-11 text-base', lg: 'h-16 w-16 text-lg' }

export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  return src ? (
    <img className={`${sizes[size]} rounded-full object-cover`} src={src} alt={`${name}的头像`} />
  ) : (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary ${sizes[size]}`} aria-label={`${name}的头像`}>
      {name.slice(0, 1)}
    </span>
  )
}
