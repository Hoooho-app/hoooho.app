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
  const baby = kind.startsWith('baby-')
  const hair = elder ? '#94A3B8' : '#334155'
  const clothing = elder ? '#7AA7A1' : female ? '#EFA3B1' : '#57B4AA'
  const faceY = baby ? 31 : child ? 29 : 28
  const faceRadius = baby ? 16 : child ? 15 : 14
  const hairPath = elder
    ? female
      ? 'M17 28c1-13 7-19 16-19 9 0 15 7 15 19-4-6-10-9-16-9s-11 3-15 9Z'
      : 'M19 25c2-10 7-15 14-15 8 0 13 5 14 15-5-4-10-6-15-6s-9 2-13 6Z'
    : female
      ? 'M16 29c0-13 7-21 17-21 11 0 17 9 16 22-5-8-12-12-21-10-4 1-8 4-12 9Z'
      : baby
        ? 'M18 27c1-11 7-17 15-17 9 0 14 6 15 17-5-5-10-7-16-7-5 0-10 3-14 7Z'
        : 'M18 26c1-11 7-17 15-17 9 0 15 6 15 17-5-5-10-7-16-7-5 0-10 3-14 7Z'

  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full bg-primary-soft ${className}`} role="img" aria-label={`${name}的虚拟卡通头像`}>
      <svg aria-hidden="true" viewBox="0 0 64 64" className="h-full w-full">
        <circle cx="32" cy="32" r="32" fill="#E6F7F3" />
        <circle cx="11" cy="15" r="4" fill="#BEEBE5" opacity="0.75" />
        <circle cx="54" cy="12" r="2.5" fill="#F8C9D3" opacity="0.75" />
        <path d={baby ? 'M10 64c3-12 10-18 22-18s19 6 22 18' : 'M11 64c2-14 10-21 21-21s19 7 21 21'} fill={clothing} />
        <path d="M26 47c2 3 10 3 12 0l3 17H23Z" fill="#FFFFFF" opacity="0.82" />
        <circle cx="17.5" cy={faceY + 1} r="3" fill="#F2B995" />
        <circle cx="46.5" cy={faceY + 1} r="3" fill="#F2B995" />
        <circle cx="32" cy={faceY} r={faceRadius} fill="#F6C9A8" />
        <path d={hairPath} fill={hair} />
        {female && !baby && <path d="M18 27c-3 11 0 19 4 23l4-6c-4-4-5-10-3-17Z" fill={hair} />}
        <circle cx="26.5" cy={faceY + 2} r="2" fill="#26374A" />
        <circle cx="38.5" cy={faceY + 2} r="2" fill="#26374A" />
        <circle cx="25.9" cy={faceY + 1.3} r="0.65" fill="#FFFFFF" />
        <circle cx="37.9" cy={faceY + 1.3} r="0.65" fill="#FFFFFF" />
        <circle cx="23" cy={faceY + 6.5} r="2.1" fill="#F29A9A" opacity="0.38" />
        <circle cx="41" cy={faceY + 6.5} r="2.1" fill="#F29A9A" opacity="0.38" />
        <path d={`M28 ${faceY + 8}c2.4 2.6 5.6 2.6 8 0`} fill="#FFFFFF" stroke="#B86F63" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
        {elder && (
          <g fill="none" stroke="#64748B" strokeWidth="1.2">
            <circle cx="26.5" cy={faceY + 2} r="4" />
            <circle cx="38.5" cy={faceY + 2} r="4" />
            <path d={`M30.5 ${faceY + 2}h4`} />
          </g>
        )}
        {baby && <path d="M29 12c0-3 2-5 5-5" fill="none" stroke={hair} strokeLinecap="round" strokeWidth="2" />}
      </svg>
    </span>
  )
}
