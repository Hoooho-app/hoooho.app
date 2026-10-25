import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Mic } from 'lucide-react'
import { HohoButton } from './HohoButton'
import './HoldToTalkButton.css'

/** Shared press feedback; microphone and transcript ownership stay with the caller. */
export function HoldToTalkButton({ onStart, onStop, onDiscard, listening = false, requesting = false, processing = false, disabled = false, audioLevel = 0, releaseLabel = '松开即结束', discardOnBlur = true, className = '', fullWidth = false, expandedFeedback = false, feedbackHint, liveTranscript, liveStatus, presentation='floating' }: {
  onStart: () => void; onStop: () => void; onDiscard?: () => void
  listening?: boolean; requesting?: boolean; processing?: boolean; disabled?: boolean
  audioLevel?: number; releaseLabel?: string; discardOnBlur?: boolean; className?: string; fullWidth?: boolean
  expandedFeedback?: boolean; feedbackHint?: string; liveTranscript?:string; liveStatus?:string
  presentation?:'floating'|'conversation'
}) {
  const [press, setPress] = useState<{ x: number; y: number }>(), [cancelling, setCancelling] = useState(false)
  const holding = useRef(false), origin = useRef(0), discard = useRef(false), pointer = useRef<number | null>(null)
  const callbacks = useRef({ onStop, onDiscard }); callbacks.current = { onStop, onDiscard }
  const active = useRef(false)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    setElapsed(0)
    if (!expandedFeedback || !listening) return
    const started = Date.now(), timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [expandedFeedback, listening])
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
  const liveTextElement=useRef<HTMLParagraphElement>(null)
  useEffect(()=>{if(liveTextElement.current)liveTextElement.current.scrollTop=liveTextElement.current.scrollHeight},[liveTranscript])
  return <>
    <HohoButton variant="primary" fullWidth={fullWidth} className={`hoho-hold-to-talk ${className}${press ? ' is-pressed' : ''}${listening ? ' is-listening' : ''}${cancelling ? ' is-cancelling' : ''}`} disabled={disabled || processing} aria-label={listening ? `正在录音，${status}` : status} aria-pressed={!!press || listening} aria-busy={requesting || processing}
      onPointerDown={e => { if (e.button !== 0 || holding.current || disabled || processing || listening || requesting) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointer.current = e.pointerId; start(e.clientX, e.clientY) }}
      onPointerMove={e => { if (!holding.current || pointer.current !== e.pointerId) return; const cancel = !!onDiscard && origin.current - e.clientY > 55; discard.current = cancel; setCancelling(cancel) }}
      onPointerUp={e => { if (pointer.current === e.pointerId) finish() }} onPointerCancel={e => { if (pointer.current === e.pointerId) finish(true) }} onLostPointerCapture={e => { if (pointer.current === e.pointerId) finish(true) }} onContextMenu={e => e.preventDefault()}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); start(r.left + r.width / 2, r.top + r.height / 2) } if (e.key === 'Escape') { e.stopPropagation(); finish(true) } }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); finish() } }} onBlur={() => finish(discardOnBlur)}>
      <Mic size={20} aria-hidden="true" />{status}
    </HohoButton>
    {press && createPortal(<div className={`hoho-hold-feedback${expandedFeedback ? ' hoho-hold-feedback--expanded' : ''}${cancelling ? ' is-cancelling' : ''}${presentation==='conversation'?' hoho-hold-feedback--conversation':''}`} style={{ left: press.x, top: press.y, '--voice-level': Math.min(1, Math.max(0, audioLevel)) } as CSSProperties}>
      <div className="hoho-hold-feedback__halo" aria-hidden="true" />
      <div className="hoho-hold-feedback__status" role="status" style={{ left: (expandedFeedback ? window.innerWidth / 2 : Math.max(96, Math.min(window.innerWidth - 96, press.x))) - press.x }}>
        {liveTranscript!==undefined&&listening&&!cancelling&&<div className="hoho-hold-feedback__transcript" aria-label="正在说的话" aria-live="polite"><small>{liveStatus||'正在听你说'}</small><p ref={liveTextElement}>{liveTranscript||'说出的内容会显示在这里…'}</p></div>}
        <div className="hoho-hold-feedback__wave" aria-hidden="true">{(presentation==='conversation'?Array.from({length:21},(_,i)=>i):[0,1,2,3,4]).map(i=><span key={i} style={{height:`${4+audioLevel*(presentation==='conversation'?10+10*Math.abs(Math.sin(i*1.2)):18-Math.abs(i-2)*5)}px`}}/>)}</div>
        {presentation==='conversation'?<>
          <span>{cancelling?'松开取消':listening?'正在录音':status}</span>
          {listening&&<span className="hoho-hold-feedback__time" aria-label={`已录音${elapsed}秒`}>{`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`}</span>}
          <small>{cancelling?'移回继续录音':onDiscard?'松开记录，上滑取消':'松开结束'}</small>
        </>:<>
          <span>{expandedFeedback && listening && !cancelling ? '正在录音' : listening && !cancelling ? `正在录音 · ${releaseLabel}` : status}</span>
          {expandedFeedback && listening && <span className="hoho-hold-feedback__time" aria-label={`已录音${elapsed}秒`}>{`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`}</span>}
          {expandedFeedback && !cancelling && <small>{listening ? releaseLabel : '请保持按住'}</small>}
          {expandedFeedback && feedbackHint && !cancelling && <small>{feedbackHint}</small>}
          {onDiscard && <small>{cancelling ? '移回继续录音' : '上滑取消'}</small>}
        </>}

      </div>
    </div>, document.body)}
  </>
}
