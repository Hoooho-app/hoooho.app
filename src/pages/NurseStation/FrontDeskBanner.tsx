import { useEffect, useState, type CSSProperties } from 'react'
import { frontDeskGreeting } from './frontDeskGreeting'
import nursePortrait from '../../assets/nurse-triage/front-desk-nurse-glasses-20261030.webp'
import recordArchive from '../../assets/nurse-triage/record-archive-dense-20261030.webp'
import visitSummary from '../../assets/nurse-triage/visit-summary-banner-20261030.webp'

const HOLD_MS = 8000
const MOSAIC_MS = 560
const motionQuery = '(prefers-reduced-motion: reduce)'
type Phase = 'idle' | 'out' | 'in'
const slides = [
  { kind: 'welcome', src: nursePortrait, width: 480, height: 786, alt: '戴眼镜与口罩的黑发护士，一手拿病历夹、一手拿笔' },
  { kind: 'visit', src: visitSummary, width: 480, height: 528, alt: '零散笔记汇成一张条理清楚的就诊情况单' },
  { kind: 'memory', src: recordArchive, width: 600, height: 512, alt: '密集层叠的记录文件与厚厚的记忆档案库' },
] as const

export function FrontDeskBanner() {
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [ready, setReady] = useState([true, false, false])
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(document.hidden)
  const [composerBusy, setComposerBusy] = useState(false)
  const [reduced, setReduced] = useState(() => matchMedia(motionQuery).matches)

  useEffect(() => {
    const images = slides.slice(1).map((slide, offset) => {
      const index = offset + 1
      const image = new Image()
      image.onload = () => setReady(previous => previous.map((value, i) => i === index ? true : value))
      image.onerror = () => setReady(previous => previous.map((value, i) => i === index ? false : value))
      image.src = slide.src
      return image
    })
    return () => { for (const image of images) { image.onload = null; image.onerror = null } }
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
    const next = Array.from({ length: slides.length }, (_, i) => (current + i + 1) % slides.length).find(index => ready[index]) ?? 0
    if (hidden || reduced || composerBusy || next === current) {
      if (phase !== 'idle') setPhase('idle')
      return
    }
    if (phase === 'out') {
      const timer = window.setTimeout(() => { setCurrent(next); setPhase('in') }, MOSAIC_MS)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'in') {
      const timer = window.setTimeout(() => setPhase('idle'), MOSAIC_MS)
      return () => window.clearTimeout(timer)
    }
    if (hovered || focused) return
    const timer = window.setTimeout(() => { setPhase('out') }, HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [current, phase, ready, hovered, focused, hidden, reduced, composerBusy])

  const slide = slides[current]
  return <div className="front-desk-welcome__hero" role="region" aria-roledescription="轮播" aria-label="护护记录介绍，聚焦时暂停自动切换" tabIndex={0} aria-live="off" data-slide={current} data-kind={slide.kind} data-phase={phase}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true) }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <div className="front-desk-welcome__copy">
      {current === 0 ? <><h2>今天怎么样？</h2><p>{frontDeskGreeting().split('。').filter(Boolean).map(sentence => <span key={sentence}>{sentence}。</span>)}</p></> : current === 1 ? <><span className="front-desk-banner__eyebrow">就诊情况单</span><h2 className="front-desk-banner__visit-title"><span>一键成单，</span><span>一次说清。</span></h2><p><span>问医生、问 AI，</span><span>不用从头讲。</span></p></> : <><h2 className="front-desk-banner__memory-title"><span>记忆很长，</span><span>不会忘。</span></h2><p>记录再多，细节也能回头找到。</p></>}
    </div>
    <div className={`front-desk-welcome__media${slide.kind === 'memory' ? ' front-desk-banner__archive' : slide.kind === 'visit' ? ' front-desk-banner__report' : ''}`}>
      <img className="front-desk-welcome__portrait" src={slide.src} alt={slide.alt} width={slide.width} height={slide.height} decoding="async" fetchPriority="high"
        onError={() => { if (current !== 0) { setReady(previous => previous.map((value, i) => i === current ? false : value)); setCurrent(0); setPhase('idle') } }}/>
    </div>
    {phase !== 'idle' && <div className="front-desk-banner__mosaic" aria-hidden="true">{Array.from({ length: 80 }, (_, i) => <span key={i} style={{ '--tile-delay': `${((i * 37) % 80) * 4}ms` } as CSSProperties}/>)}</div>}
  </div>
}
