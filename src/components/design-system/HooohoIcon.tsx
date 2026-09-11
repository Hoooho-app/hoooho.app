import type { CSSProperties, SVGProps } from 'react'

export type HooohoIconName = 'about' | 'activity' | 'allergy-test' | 'bowel-movement' | 'close' | 'current-child' | 'feedback' | 'feeding' | 'health-profile' | 'health-record' | 'help' | 'instructions' | 'meal' | 'medical-note' | 'medical-visit' | 'medication' | 'menu' | 'observation' | 'reminder' | 'right-arrow' | 'service-station' | 'settings' | 'sleep' | 'snack' | 'solid-food' | 'supplement' | 'symptom' | 'vaccine'
export type HooohoIconSize = 16 | 20 | 24 | 32
export type HooohoIconState = 'default' | 'selected' | 'disabled' | 'warning' | 'pending' | 'completed'

export interface HooohoIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: HooohoIconName
  size?: HooohoIconSize
  state?: HooohoIconState
}

function Glyph({ name }: { name: HooohoIconName }) {
  switch (name) {
    case 'menu': return <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="7" cy="12" r="1" fill="currentColor"/></>
    case 'current-child': return <><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/><path d="M9 15c1.5 1.5 4.5 1.5 6 0"/></>
    case 'health-profile': return <><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><rect x="8" y="10" width="8" height="6" rx="1"/><circle cx="12" cy="13" r="1.5"/></>
    case 'health-record': return <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H12M20 19.5v-15A2.5 2.5 0 0 0 17.5 2H12M12 2v20M4 19.5a2.5 2.5 0 0 1 2.5-2.5h11a2.5 2.5 0 0 1 2.5 2.5M15 6h2M15 10h2M7 6h2"/></>
    case 'service-station': return <><path d="M4.5 4.5 6 3l1.5 1.5M4.5 3v5c0 2.2 1.8 4 4 4h7c2.2 0 4-1.8 4-4V3M18.5 4.5 20 3l1.5 1.5M12 12v6"/><circle cx="12" cy="19" r="2"/><path d="M9.5 7h5"/></>
    case 'instructions': return <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 2v20M12 2v6l2-1.5L16 8V2"/></>
    case 'settings': return <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>
    case 'help': return <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="1" fill="currentColor"/></>
    case 'feedback': return <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h8M8 14h4"/></>
    case 'about': return <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/><rect x="11" y="7" width="2" height="2" rx="1"/></>
    case 'close': return <><path d="M18 6 6 18M6 6l12 12"/></>
    case 'right-arrow': return <path d="m9 18 6-6-6-6"/>
    case 'medical-note': return <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 10h6M9 14h6M9 18h4"/></>
    case 'reminder': return <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/><circle cx="18" cy="6" r="2" fill="currentColor" stroke="none"/></>
    case 'observation':
    case 'symptom': return <path d="M12 5v14M5 12h14"/>
    case 'allergy-test': return <><path d="M9 2h6M10 2v15a2 2 0 0 0 4 0V2M10 8h4M10 12h4"/><circle cx="15" cy="5" r="1"/><circle cx="17" cy="9" r="1.5"/></>
    case 'feeding': return <path d="M8 10v9a3 3 0 0 0 6 0v-9M7 10h10M10 10V6a2 2 0 0 1 4 0v4M12 2v2M10 14h2M10 17h2"/>
    case 'solid-food': return <path d="M4 14a8 8 0 0 0 16 0H4zM17 10l-4-4a2.8 2.8 0 0 0-4 4l4 4M15 8l4-4"/>
    case 'meal': return <path d="M9 2v6c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V2M7 10v12M17 2v20M17 2c2 0 3 2 3 6h-3"/>
    case 'snack': return <><path d="M12 21a8 8 0 0 0 7-9 5 5 0 0 1-5-6 8 8 0 1 0-2 15z"/><path d="M12 3s-2 2-2 4 2 2 2 2 2-2 2-4-2-2-2-2z"/></>
    case 'supplement': return <><path d="M8 8v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8"/><rect x="7" y="5" width="10" height="3" rx="1"/><path d="M10 5V3a1 1 0 0 1 2 0v2"/><circle cx="12" cy="15" r="2"/><path d="M12 11v2"/></>
    case 'sleep': return <path d="M4 8h6l-6 8h6M14 4h4l-4 5h4M17 16h3l-3 4h3"/>
    case 'bowel-movement': return <><path d="M12 21c-4.4 0-8-3.6-8-8 0-5 6-10 8-11 2 1 8 6 8 11 0 4.4-3.6 8-8 8z"/><path d="M12 11a2 2 0 0 1 2 2v2a2 2 0 0 1-4 0v-2a2 2 0 0 1 2-2z"/></>
    case 'activity': return <><circle cx="15" cy="5" r="2"/><path d="M14 8l-2 5-4-1M12 13l2 5h4M7 20l4-5M17 9l-4-1-2-3"/></>
    case 'medication': return <><path d="M17.5 6.5l-11 11a4.2 4.2 0 1 1-6-6l11-11a4.2 4.2 0 1 1 6 6zM15 9l-6 6"/><circle cx="18" cy="18" r="3"/><path d="M18 15v6"/></>
    case 'vaccine': return <><path d="M14 4l6 6M12 6l6 6M13 11l-6 6a2 2 0 0 1-2.8 0 2 2 0 0 1 0-2.8l6-6M10 14l-6 6M2 22l3-3M15 9l3-3"/><circle cx="8" cy="10" r="1"/></>
    case 'medical-visit': return <><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M12 10v6M9 13h6"/></>
  }
}

export function HooohoIcon({ 'aria-label': ariaLabel, 'aria-hidden': ariaHidden, className = '', name, size = 24, state = 'default', style, ...props }: HooohoIconProps) {
  const decorative = ariaHidden ?? !ariaLabel
  const stableStyle: CSSProperties = { flexShrink: 0, ...style }
  return <svg {...props} aria-hidden={decorative || undefined} aria-label={ariaLabel} className={`hoooho-icon ${className}`.trim()} data-icon={name} data-state={state} fill="none" height={size} role={decorative ? undefined : 'img'} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" style={stableStyle} viewBox="0 0 24 24" width={size}><Glyph name={name} /></svg>
}
