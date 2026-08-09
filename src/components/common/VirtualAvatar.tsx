import type { VirtualAvatarKind } from '../../utils/virtualAvatar'

interface VirtualAvatarProps {
  kind: VirtualAvatarKind
  className?: string
  name: string
}

const femaleKinds = new Set<VirtualAvatarKind>(['baby-girl', 'girl', 'woman', 'grandmother'])
const childKinds = new Set<VirtualAvatarKind>(['baby-boy', 'baby-girl', 'boy', 'girl'])
const elderKinds = new Set<VirtualAvatarKind>(['grandfather', 'grandmother'])

export function VirtualAvatar({ kind, className = '', name }: VirtualAvatarProps) {
  const female = femaleKinds.has(kind)
  const child = childKinds.has(kind)
  const elder = elderKinds.has(kind)
  const hair = elder ? '#94A3B8' : '#334155'
  const clothing = female ? '#F29CAB' : '#66B8AE'

  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full bg-primary-soft ${className}`} role="img" aria-label={`${name}的虚拟头像`}>
      <svg aria-hidden="true" viewBox="0 0 64 64" className="h-full w-full">
        <circle cx="32" cy="32" r="32" fill="#E6F7F3" />
        <path d="M12 64c2-13 9-20 20-20s18 7 20 20" fill={clothing} />
        <circle cx="32" cy={child ? 30 : 29} r={child ? 15 : 14} fill="#F6C9A8" />
        <path d={female ? 'M17 29c0-13 7-20 16-20 10 0 16 8 15 21-4-8-11-12-20-10-3 1-7 4-11 9Z' : 'M18 27c1-12 7-18 15-18 9 0 15 6 15 17-5-5-10-7-16-7-5 0-10 3-14 8Z'} fill={hair} />
        {female && <path d="M18 27c-3 11 0 19 4 23l4-6c-4-4-5-10-3-17Z" fill={hair} />}
        <circle cx="27" cy="31" r="1.25" fill="#334155" />
        <circle cx="38" cy="31" r="1.25" fill="#334155" />
        <path d="M28 37c2.5 2 5.5 2 8 0" fill="none" stroke="#B86F63" strokeLinecap="round" strokeWidth="1.5" />
        {elder && (
          <g fill="none" stroke="#64748B" strokeWidth="1.2">
            <circle cx="27" cy="31" r="4" />
            <circle cx="38" cy="31" r="4" />
            <path d="M31 31h3" />
          </g>
        )}
        {kind.startsWith('baby-') && <path d="M29 12c0-3 2-5 5-5" fill="none" stroke={hair} strokeLinecap="round" strokeWidth="2" />}
      </svg>
    </span>
  )
}
