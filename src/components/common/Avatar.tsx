import { parseVirtualAvatarId } from '../../utils/virtualAvatar'
import { parseClayAvatar } from '../../utils/clayAvatar'
import { parseStoredChildAvatar } from '../../utils/childAvatar'
import { ChildAvatar } from './ChildAvatar'
import { ClayAvatar } from './ClayAvatar'
import { VirtualAvatar } from './VirtualAvatar'

interface AvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizes = { sm: 'h-9 w-9 text-sm', md: 'h-11 w-11 text-base', lg: 'h-16 w-16 text-lg', xl: 'h-28 w-28 text-2xl' }

export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const childAvatar = parseStoredChildAvatar(src)
  const clayAvatar = parseClayAvatar(src)
  const virtualAvatar = parseVirtualAvatarId(src)

  if (childAvatar) {
    return <ChildAvatar className={sizes[size]} selection={childAvatar} name={name} />
  }

  if (clayAvatar) {
    return <ClayAvatar className={sizes[size]} config={clayAvatar} name={name} />
  }

  if (virtualAvatar) {
    return <VirtualAvatar className={sizes[size]} kind={virtualAvatar.kind} name={name} variant={virtualAvatar.variant} />
  }

  return src ? (
    <img className={`${sizes[size]} rounded-full object-cover`} src={src} alt={`${name}的头像`} />
  ) : (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary ${sizes[size]}`} aria-label={`${name}的头像`}>
      {name.slice(0, 1)}
    </span>
  )
}
