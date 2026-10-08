import { CompleteImage } from './CompleteImage'
import father0 from '../../assets/avatars/father-0.1dcd3ecb48.webp'
import father1 from '../../assets/avatars/father-1.4428a405d4.webp'
import father2 from '../../assets/avatars/father-2.ff82f70971.webp'
import grandfather0 from '../../assets/avatars/grandfather-0.afbf5230c1.webp'
import grandfather1 from '../../assets/avatars/grandfather-1.5e80957407.webp'
import grandfather2 from '../../assets/avatars/grandfather-2.7a997984c3.webp'
import grandmother0 from '../../assets/avatars/grandmother-0.3171771ac8.webp'
import grandmother1 from '../../assets/avatars/grandmother-1.873c6e7bc8.webp'
import grandmother2 from '../../assets/avatars/grandmother-2.8a9dd0e3c2.webp'
import mother0 from '../../assets/avatars/mother-0.c5ac6dc853.webp'
import mother1 from '../../assets/avatars/mother-1.563be689d2.webp'
import mother2 from '../../assets/avatars/mother-2.1d60566087.webp'
import type { VirtualAvatarKind } from '../../utils/virtualAvatar'
import { childAvatarVariants } from '../../utils/childAvatar'
import { ChildAvatar } from './ChildAvatar'

interface VirtualAvatarProps {
  kind: VirtualAvatarKind
  className?: string
  name: string
  variant?: number
}

const avatarAssets = {
  man: [father0, father1, father2],
  woman: [mother0, mother1, mother2],
  grandfather: [grandfather0, grandfather1, grandfather2],
  grandmother: [grandmother0, grandmother1, grandmother2],
} satisfies Record<Extract<VirtualAvatarKind, 'man' | 'woman' | 'grandfather' | 'grandmother'>, readonly [string, string, string]>

const assetRoleByKind = {
  man: 'man',
  woman: 'woman',
  grandfather: 'grandfather',
  grandmother: 'grandmother',
} as const satisfies Record<Extract<VirtualAvatarKind, 'man' | 'woman' | 'grandfather' | 'grandmother'>, keyof typeof avatarAssets>

export function VirtualAvatar({ kind, className = '', name, variant = 0 }: VirtualAvatarProps) {
  const safeVariant = Math.abs(variant) % 3
  if (kind === 'baby-boy' || kind === 'baby-girl' || kind === 'boy' || kind === 'girl') {
    return <ChildAvatar
      className={className}
      name={name}
      selection={{
        age: kind.startsWith('baby-') ? 0 : 7,
        gender: kind.endsWith('girl') ? 'girl' : 'boy',
        variant: childAvatarVariants[safeVariant]
      }}
    />
  }
  const asset = avatarAssets[assetRoleByKind[kind]][safeVariant]

  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full bg-primary-soft ${className}`} role="img" aria-label={`${name}的虚拟卡通头像`}>
      <CompleteImage aria-hidden="true" alt="" className="h-full w-full object-cover" draggable={false} src={asset} />
    </span>
  )
}
