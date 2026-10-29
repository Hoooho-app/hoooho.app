import { useEffect, useState, type CSSProperties } from 'react'
import { frontDeskGreeting } from './frontDeskGreeting'
import nursePortrait from '../../assets/nurse-triage/front-desk-nurse-glasses-20261030.webp'
import recordArchive from '../../assets/nurse-triage/record-archive-20261030.webp'

const HOLD_MS = 8000
const MOSAIC_MS = 560
const motionQuery = '(prefers-reduced-motion: reduce)'
type Phase = 'idle' | 'out' | 'in'

export function FrontDeskBanner() {
  const [current, setCurrent] = useState(0)
  const [target, setTarget] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(document.hidden)
  const [composerBusy, setComposerBusy] = useState(false)
  const [reduced, setReduced] = useState(() => matchMedia(motionQuery).matches)

  useEffect(() => {
    const image = new Image()
    image.onload = () => setReady(true)
    image.onerror = () => setReady(false)
    image.src = recordArchive
    return () => { image.onload = null; image.onerror = null }
  }, [])

  useEffect(() => {
    const media = matchMedia(motionQuery)
    const changeMotion = () => setReduced(media.matches)
    const visibility = () => {
      setHidden(document.hidden)
      if (document.hidden) { pressed = false; syncComposer() }
    }
    let listening = true
    let pressed = false
    const syncComposer = () => {
      if (!listening) return
      const footer = document.querySelector('.smart-record-home .smart-record-page__footer')
      const active = document.activeElement
      const editing = !!active && !!footer?.contains(active) && active.matches('input,textarea,[contenteditable="true"]')
      const draft = [...footer?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea') ?? []].some(input => input.value.trim().length > 0)
      setComposerBusy(pressed || editing || draft)
    }
    const pointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.smart-record-page__footer')) { pressed = true; syncComposer() }
    }
    const pointerUp = () => { pressed = false; syncComposer() }
    const keyDown = (event: KeyboardEvent) => {
      if ((event.key === ' ' || event.key === 'Enter') && event.target instanceof Element && event.target.closest('.smart-record-page__footer')) { pressed = true; syncComposer() }
    }
    const keyUp = (event: KeyboardEvent) => { if (event.key === ' ' || event.key === 'Enter') pointerUp() }
    const focusOut = () => queueMicrotask(syncComposer)
    media.addEventListener('change', changeMotion)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('focusin', syncComposer)
    document.addEventListener('focusout', focusOut)
    document.addEventListener('input', syncComposer)
    document.addEventListener('pointerdown', pointerDown)
    document.addEventListener('pointerup', pointerUp)
    document.addEventListener('pointercancel', pointerUp)
    document.addEventListener('lostpointercapture', pointerUp)
    document.addEventListener('keydown', keyDown)
    document.addEventListener('keyup', keyUp)
    syncComposer()
    return () => {
      listening = false
      media.removeEventListener('change', changeMotion)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('focusin', syncComposer)
      document.removeEventListener('focusout', focusOut)
      document.removeEventListener('input', syncComposer)
      document.removeEventListener('pointerdown', pointerDown)
      document.removeEventListener('pointerup', pointerUp)
      document.removeEventListener('pointercancel', pointerUp)
      document.removeEventListener('lostpointercapture', pointerUp)
      document.removeEventListener('keydown', keyDown)
      document.removeEventListener('keyup', keyUp)
    }
  }, [])

  useEffect(() => {
    if (hidden || reduced || composerBusy || !ready) {
      if (phase !== 'idle') setPhase('idle')
      return
    }
    if (phase === 'out') {
      const timer = window.setTimeout(() => { setCurrent(target); setPhase('in') }, MOSAIC_MS)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'in') {
      const timer = window.setTimeout(() => setPhase('idle'), MOSAIC_MS)
      return () => window.clearTimeout(timer)
    }
    if (paused || hovered || focused) return
    const timer = window.setTimeout(() => { setTarget(1 - current); setPhase('out') }, HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [current, target, phase, ready, paused, hovered, focused, hidden, reduced, composerBusy])

  const select = (next: number) => {
    if (!ready) return
    if (next === current) { setTarget(current); setPhase('idle'); return }
    setTarget(next)
    if (reduced || composerBusy || hidden) { setCurrent(next); setPhase('idle') }
    else setPhase('out')
  }
  return <div className="front-desk-welcome__hero" role="region" aria-roledescription="轮播" aria-label="护护记录介绍" aria-live="off" data-slide={current} data-phase={phase}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true) }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <div className="front-desk-welcome__copy">
      {current === 0 ? <><h2>今天怎么样？</h2><p>{frontDeskGreeting().split('。').filter(Boolean).map(sentence => <span key={sentence}>{sentence}。</span>)}</p></> : <><h2 className="front-desk-banner__trust-title">记过的，<br/>以后能回看。</h2><p><span>存好的记录，</span><span>随时去健康日历回看。</span></p></>}
    </div>
    <div className={`front-desk-welcome__media${current === 1 ? ' front-desk-banner__archive' : ''}`}>
      <img className="front-desk-welcome__portrait" src={current === 0 ? nursePortrait : recordArchive} alt={current === 0 ? '戴眼镜与口罩的黑发护士，一手拿病历夹、一手拿笔' : '按时间留存的记录页、档案夹与日历'} width={480} height={current === 0 ? 786 : 559} decoding="async" fetchPriority="high"
        onError={() => { if (current === 1) { setReady(false); setCurrent(0); setPhase('idle') } }}/>
    </div>
    {phase !== 'idle' && <div className="front-desk-banner__mosaic" aria-hidden="true">{Array.from({ length: 80 }, (_, i) => <span key={i} style={{ '--tile-delay': `${((i * 37) % 80) * 4}ms` } as CSSProperties}/>)}</div>}
    {ready && <div className="front-desk-banner__controls" role="group" aria-label="切换首页介绍">
      <button type="button" className="front-desk-banner__dot" aria-label="查看第1张：今天怎么样" aria-pressed={current === 0} onClick={() => select(0)}><span/></button>
      <button type="button" className="front-desk-banner__dot" aria-label="查看第2张：长期记录" aria-pressed={current === 1} onClick={() => select(1)}><span/></button>
      {!reduced && <button type="button" className="front-desk-banner__pause" aria-label={paused ? '继续自动切换介绍' : '暂停自动切换介绍'} onClick={() => { setPaused(!paused); if (paused) setFocused(false) }}>{paused ? '继续' : '暂停'}</button>}
    </div>}
  </div>
}
