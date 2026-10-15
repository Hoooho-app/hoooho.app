import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Mic } from 'lucide-react'
import { HohoButton } from './HohoButton'
import './HoldToTalkButton.css'

/** Shared press feedback; microphone and transcript ownership stay with the caller. */
export function HoldToTalkButton({ onStart, onStop, onDiscard, listening = false, requesting = false, processing = false, disabled = false, audioLevel = 0, releaseLabel = '松开即结束', discardOnBlur = true, className = '', fullWidth = false }: {
  onStart: () => void; onStop: () => void; onDiscard?: () => void
  listening?: boolean; requesting?: boolean; processing?: boolean; disabled?: boolean
  audioLevel?: number; releaseLabel?: string; discardOnBlur?: boolean; className?: string; fullWidth?: boolean
}) {
  const [press, setPress] = useState<{ x: number; y: number }>(), [cancelling, setCancelling] = useState(false)
  const holding = useRef(false), origin = useRef(0), discard = useRef(false), pointer = useRef<number | null>(null)
  const callbacks = useRef({ onStop, onDiscard }); callbacks.current = { onStop, onDiscard }
  const active = useRef(false)
  const clear = () => { holding.current = false; pointer.current = null; discard.current = false; setPress(undefined); setCancelling(false) }
  const finish = (cancel = discard.current) => {
    if (!holding.current) return
    clear(); (cancel ? callbacks.current.onDiscard ?? callbacks.current.onStop : callbacks.current.onStop)()
  }
  useEffect(() => {
    if (active.current && !listening && !requesting) clear()
    active.current = listening || requesting
  }, [listening, requesting])
  useEffect(() => {
    const cancel = () => finish(true), hidden = () => { if (document.hidden) cancel() }
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden)
      if (holding.current) { holding.current = false; (callbacks.current.onDiscard ?? callbacks.current.onStop)() }
    }
  }, [])
  const start = (x: number, y: number) => {
    if (holding.current || disabled || processing || listening || requesting) return
    holding.current = true; origin.current = y; discard.current = false; setCancelling(false); setPress({ x, y })
    // Optional hardware feedback must never prevent recording; no sound is played.
    try { navigator.vibrate?.(15) } catch { /* Browsers may decline vibration. */ }
    onStart()
  }
  const status = cancelling ? '松开取消' : listening ? releaseLabel : requesting || press ? '正在开启麦克风…' : processing ? '识别中…' : '按住说话'
  return <>
    <HohoButton variant="primary" fullWidth={fullWidth} className={`hoho-hold-to-talk ${className}${press ? ' is-pressed' : ''}${listening ? ' is-listening' : ''}${cancelling ? ' is-cancelling' : ''}`} disabled={disabled || processing} aria-label={listening ? `正在录音，${status}` : status} aria-pressed={!!press || listening} aria-busy={requesting || processing}
      onPointerDown={e => { if (e.button !== 0 || holding.current || disabled || processing || listening || requesting) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointer.current = e.pointerId; start(e.clientX, e.clientY) }}
      onPointerMove={e => { if (!holding.current || pointer.current !== e.pointerId) return; const cancel = !!onDiscard && origin.current - e.clientY > 55; discard.current = cancel; setCancelling(cancel) }}
      onPointerUp={e => { if (pointer.current === e.pointerId) finish() }} onPointerCancel={e => { if (pointer.current === e.pointerId) finish(true) }} onLostPointerCapture={e => { if (pointer.current === e.pointerId) finish(true) }} onContextMenu={e => e.preventDefault()}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); start(r.left + r.width / 2, r.top + r.height / 2) } if (e.key === 'Escape') { e.stopPropagation(); finish(true) } }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); finish() } }} onBlur={() => finish(discardOnBlur)}>
      <Mic size={20} aria-hidden="true" />{status}
    </HohoButton>
    {press && createPortal(<div className={`hoho-hold-feedback${cancelling ? ' is-cancelling' : ''}`} style={{ left: press.x, top: press.y, '--voice-level': Math.min(1, Math.max(0, audioLevel)) } as CSSProperties}>
      <div className="hoho-hold-feedback__halo" aria-hidden="true" />
      <div className="hoho-hold-feedback__status" role="status" style={{ left: Math.max(96, Math.min(window.innerWidth - 96, press.x)) - press.x }}>
        <div className="hoho-hold-feedback__wave" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <span key={i} style={{ height: `${4 + audioLevel * (18 - Math.abs(i - 2) * 5)}px` }} />)}</div>
        <span>{listening && !cancelling ? `正在录音 · ${releaseLabel}` : status}</span>
        {onDiscard && <small>{cancelling ? '移回继续录音' : '上滑取消'}</small>}
      </div>
    </div>, document.body)}
  </>
}
