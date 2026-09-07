import { BookOpen, ChevronRight, CircleCheck, FilePenLine, Files, FolderHeart, HeartHandshake, Lightbulb, Search, ShieldCheck, Sprout, Users, X } from 'lucide-react'
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { NurseBubbleModel, NurseBubbleType } from './nurseBubbles'

const icons = { safety: ShieldCheck, attention: Sprout, medication: FilePenLine, 'medical-prep': FolderHeart, supplement: FilePenLine, organize: Files, reassurance: CircleCheck, research: Search, family: Users, tips: Lightbulb, tutorial: BookOpen } satisfies Record<NurseBubbleType, typeof BookOpen>

export function NurseBubble({ animate, bubble, onDismiss, onOpen }: { animate: boolean; bubble: NurseBubbleModel; onDismiss: () => void; onOpen: () => void }) {
  const Icon = icons[bubble.type]
  const startX = useRef<number | null>(null)
  const dragged = useRef(false)
  const [offset, setOffset] = useState(0)
  const [exiting, setExiting] = useState(false)
  const dismiss = () => { if (bubble.type === 'safety') { onDismiss(); return } setExiting(true); window.setTimeout(onDismiss, 180) }
  const pointerDown = (event: PointerEvent) => { startX.current = event.clientX; dragged.current = false; event.currentTarget.setPointerCapture(event.pointerId) }
  const pointerMove = (event: PointerEvent) => { if (startX.current === null) return; const next = Math.min(0, event.clientX - startX.current); dragged.current ||= Math.abs(next) > 6; setOffset(Math.max(-72, next)) }
  const pointerUp = () => { if (offset <= -44) dismiss(); else setOffset(0); startX.current = null }
  return <div className="nurse-bubble" data-animate={animate} data-exiting={exiting} data-tone={bubble.type} style={{ '--bubble-offset': `${offset}px` } as CSSProperties}>
    <button aria-label={`${bubble.title}${bubble.count > 1 ? `，${bubble.count}项` : ''}`} className="nurse-bubble__main" onClick={() => { if (!dragged.current) onOpen() }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} type="button"><Icon aria-hidden="true" /><span>{bubble.title}</span>{bubble.count > 1 && <strong>{bubble.count > 9 ? '9+' : bubble.count}</strong>}<ChevronRight aria-hidden="true" /></button>
    <button aria-label={`擦除${bubble.title}`} className="nurse-bubble__dismiss" onClick={dismiss} type="button"><X /></button>
  </div>
}

export function MoreNurseBubbles({ count, onClick }: { count: number; onClick: () => void }) { return <button className="nurse-bubble-more" onClick={onClick} type="button"><HeartHandshake />还有 {count > 99 ? '99+' : count} 条<ChevronRight /></button> }
