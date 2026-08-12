import type { VirtualAvatarKind } from '../../utils/virtualAvatar'

interface VirtualAvatarProps {
  kind: VirtualAvatarKind
  className?: string
  name: string
  variant?: number
}

const childKinds = new Set<VirtualAvatarKind>(['baby-boy', 'baby-girl', 'boy', 'girl'])

const backgrounds = ['#E8F6F3', '#EEF3F7', '#FFF3EA']
const hairPalettes = {
  child: ['#263238', '#3B2B28', '#4B342A'],
  adult: ['#3A2925', '#263238', '#5A382B'],
  elder: ['#D5D7D8', '#B9C0C3', '#DED8D2'],
}
const clothingPalettes = {
  boy: ['#E6B54A', '#4B9E91', '#6C91C2'],
  girl: ['#E58C9E', '#8B83BE', '#E0A24E'],
  woman: ['#D98F8B', '#5EAFA5', '#A48ABE'],
  man: ['#3D9B8D', '#5E82B2', '#A77A5A'],
  grandfather: ['#A88462', '#708D88', '#7D86A0'],
  grandmother: ['#9685B4', '#659D85', '#B87A82'],
} satisfies Record<'boy' | 'girl' | 'woman' | 'man' | 'grandfather' | 'grandmother', string[]>

function ChildHair({ girl, hair, variant }: { girl: boolean; hair: string; variant: number }) {
  if (girl) return (
    <g>
      <circle cx="13" cy="29" r="7" fill={hair} /><circle cx="51" cy="29" r="7" fill={hair} />
      <path d="M13 24c-4-3-4-7-1-9 3 0 6 2 7 5M51 24c4-3 4-7 1-9-3 0-6 2-7 5" fill={hair} />
      <path d="M17 30C16 17 22 10 32 10s16 7 15 20c-5-7-11-10-19-9-4 1-8 4-11 9Z" fill={hair} />
      <circle cx="15" cy="22" r="2.2" fill={variant === 1 ? '#7CC6BA' : variant === 2 ? '#E7AF48' : '#E98DA2'} />
      <circle cx="49" cy="22" r="2.2" fill={variant === 1 ? '#7CC6BA' : variant === 2 ? '#E7AF48' : '#E98DA2'} />
    </g>
  )
  const path = variant === 1
    ? 'M17 28c0-12 7-19 16-19 10 0 16 7 15 19-4-5-8-8-12-9l-2 6-4-5-5 5-2-5c-2 2-4 5-6 8Z'
    : variant === 2
      ? 'M17 28c1-12 7-19 16-19 9 0 16 7 15 19-5-6-11-8-18-8-5 0-9 3-13 8Z'
      : 'M17 28c0-12 7-19 16-19 10 0 16 7 15 19-5-5-10-8-16-8s-11 3-15 8Z'
  return <path d={path} fill={hair} />
}

function AdultHair({ woman, hair, variant }: { woman: boolean; hair: string; variant: number }) {
  if (woman) return (
    <g fill={hair}>
      <path d="M15 50c-3-11-3-24 2-33C21 9 28 6 35 7c10 1 16 10 15 23 0 8-2 15-5 20l-7-5H25l-10 5Z" />
      <path d={variant === 2 ? 'M16 29C18 15 25 8 35 9c9 1 14 8 14 19-5-8-10-11-17-12-4 7-9 10-16 13Z' : 'M16 29C18 15 25 8 35 9c9 1 14 8 14 19-4-7-9-11-16-12-4 6-9 10-19 13Z'} />
    </g>
  )
  const path = variant === 1
    ? 'M17 27c1-11 8-18 17-18 10 0 16 7 15 18-6-5-12-7-18-6-5 1-9 3-14 6Z'
    : variant === 2
      ? 'M17 27c1-11 7-18 17-18 10 0 16 7 15 18-4-5-9-8-15-8-6 0-11 3-17 8Z'
      : 'M17 27c1-11 8-18 17-18 10 0 16 7 15 18-4-6-9-8-15-8-6 0-11 3-17 8Z'
  return <path d={path} fill={hair} />
}

function ElderHair({ grandmother, hair }: { grandmother: boolean; hair: string }) {
  if (grandmother) return (
    <g fill={hair}>
      <circle cx="17" cy="23" r="7" /><circle cx="20" cy="15" r="7" /><circle cx="28" cy="11" r="7" />
      <circle cx="37" cy="11" r="7" /><circle cx="45" cy="16" r="7" /><circle cx="48" cy="24" r="7" />
      <path d="M15 46c-3-11-2-20 3-27 7-10 23-11 30 1 4 7 4 17 1 27l-8 2H23l-8-3Z" />
      <path d="M18 29c2-10 8-15 15-15 8 0 13 5 15 15-5-6-10-8-16-8s-10 3-14 8Z" fill="#F6C8A8" />
    </g>
  )
  return <g fill={hair}><path d="M18 27c1-11 7-18 16-18 10 0 16 7 15 18-5-5-10-7-16-7s-10 2-15 7Z" /><path d="M20 16c4-6 9-8 15-8 5 0 9 2 12 6-9-2-18-1-27 2Z" fill="#F4F2EF" opacity=".75" /></g>
}

export function VirtualAvatar({ kind, className = '', name, variant = 0 }: VirtualAvatarProps) {
  const safeVariant = Math.abs(variant) % 3
  const child = childKinds.has(kind)
  const female = kind === 'baby-girl' || kind === 'girl' || kind === 'woman' || kind === 'grandmother'
  const elder = kind === 'grandfather' || kind === 'grandmother'
  const baby = kind.startsWith('baby-')
  const woman = kind === 'woman'
  const man = kind === 'man'
  const grandmother = kind === 'grandmother'
  const grandfather = kind === 'grandfather'
  const role = child ? (female ? 'girl' : 'boy') : elder ? (female ? 'grandmother' : 'grandfather') : female ? 'woman' : 'man'
  const hair = hairPalettes[elder ? 'elder' : child ? 'child' : 'adult'][safeVariant]
  const clothing = clothingPalettes[role][safeVariant]
  const faceY = baby ? 31 : child ? 30 : elder ? 29 : 28
  const faceRx = baby ? 15.5 : child ? 15 : elder ? 14.5 : female ? 14 : 15
  const faceRy = baby ? 16 : child ? 16 : elder ? 16.5 : 17

  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full bg-primary-soft ${className}`} role="img" aria-label={`${name}的虚拟卡通头像`}>
      <svg aria-hidden="true" viewBox="0 0 64 64" className="h-full w-full">
        <circle cx="32" cy="32" r="32" fill={backgrounds[safeVariant]} />
        <circle cx="10" cy="14" r="3.5" fill="#BDE7E0" opacity=".75" /><circle cx="54" cy="12" r="2.4" fill="#F2C8CF" opacity=".7" />
        <path d={child ? 'M8 64c4-12 12-18 24-18s20 6 24 18Z' : 'M7 64c4-14 13-21 25-21s21 7 25 21Z'} fill={clothing} />
        {child && <path d="M25 47c2 4 12 4 14 0l3 17H22Z" fill="#FFF" opacity=".88" />}
        {woman && <path d="M27 46c2 3 8 3 10 0l4 18H23Z" fill="#FFF8F3" opacity=".9" />}
        {man && <path d="M27 45h10l1 8-6 5-6-5Z" fill="#EAF4F2" opacity=".9" />}
        {elder && <path d="M25 46h14l3 18H22Z" fill="#F7F4EE" opacity=".9" />}
        {woman && <AdultHair woman hair={hair} variant={safeVariant} />}
        {grandmother && <ElderHair grandmother hair={hair} />}
        <circle cx="17.3" cy={faceY + 1} r="3" fill="#EAB18E" /><circle cx="46.7" cy={faceY + 1} r="3" fill="#EAB18E" />
        <ellipse cx="32" cy={faceY} rx={faceRx} ry={faceRy} fill="#F6C8A8" />
        {child && <ChildHair girl={female} hair={hair} variant={safeVariant} />}
        {woman && <path d={safeVariant === 2 ? 'M17 28c2-12 8-18 18-18 8 1 13 7 14 17-5-7-10-10-17-11-4 7-9 10-15 12Z' : 'M17 28c2-12 8-18 18-18 8 1 13 7 14 17-4-7-9-10-16-11-4 6-9 9-16 12Z'} fill={hair} />}
        {man && <AdultHair woman={false} hair={hair} variant={safeVariant} />}
        {grandfather && <ElderHair grandmother={false} hair={hair} />}
        <ellipse cx="26.4" cy={faceY + 1.5} rx={child ? 2.2 : 1.8} ry={child ? 2.5 : 2.1} fill="#263746" />
        <ellipse cx="38.2" cy={faceY + 1.5} rx={child ? 2.2 : 1.8} ry={child ? 2.5 : 2.1} fill="#263746" />
        <circle cx="25.8" cy={faceY + .6} r=".7" fill="#FFF" /><circle cx="37.6" cy={faceY + .6} r=".7" fill="#FFF" />
        <circle cx="22.5" cy={faceY + 7} r="2.2" fill="#EB8E8E" opacity={child ? '.42' : '.25'} />
        <circle cx="41.5" cy={faceY + 7} r="2.2" fill="#EB8E8E" opacity={child ? '.42' : '.25'} />
        <path d={child ? `M27 ${faceY + 8}c2 4 8 4 10 0` : `M28 ${faceY + 8}c2 2.5 6 2.5 8 0`} fill={child ? '#FFF' : 'none'} stroke="#AD6259" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
        {elder && <g><g fill="none" stroke="#53636A" strokeWidth="1.1"><circle cx="26.3" cy={faceY + 1.5} r="4.2" /><circle cx="38.3" cy={faceY + 1.5} r="4.2" /><path d={`M30.5 ${faceY + 1.5}h3.6`} /></g><path d={`M21 ${faceY - 2}c2-1 4-1 6 0M37 ${faceY - 2}c2-1 4-1 6 0`} fill="none" stroke="#C48E78" strokeLinecap="round" strokeWidth=".7" opacity=".7" /></g>}
        {grandfather && <path d={`M26 ${faceY + 6}c2 2 10 2 12 0-1 5-3 7-6 7s-5-2-6-7Z`} fill="#E6E3DE" />}
        {woman && safeVariant === 0 && <g fill="#D6A34A"><circle cx="17.4" cy="34" r="1.2" /><circle cx="46.6" cy="34" r="1.2" /></g>}
        {baby && <path d="M30 10c0-3 2-5 5-5" fill="none" stroke={hair} strokeLinecap="round" strokeWidth="2" />}
      </svg>
    </span>
  )
}
