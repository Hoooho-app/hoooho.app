import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { HohoButton } from './HohoButton'
import { spotlightLayout, spotlightPath, type GuideRect, type GuideViewport } from './spotlightGeometry'
import './HohoSpotlightGuide.css'

interface GuideProps {
  targets: string[]
  title: string
  description: string
  step: number
  total: number
  nextLabel?: string
  nextDisabled?: boolean
  onNext?: () => void
  onPrevious?: () => void
  onExit: () => void
  onInteraction?: (event: Event) => void
}
interface Measured { elements: HTMLElement[]; rects: GuideRect[]; viewport: GuideViewport; container: HTMLElement; suspended: boolean }
const visible = (node: HTMLElement) => node.isConnected && !node.closest('[inert],[aria-hidden="true"]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'
const focusables = (root: HTMLElement) => [root, ...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex]')].filter(node => visible(node) && !node.matches(':disabled,[aria-disabled="true"]') && node.tabIndex >= 0)
function layer(node: HTMLElement) {
  let value = 0
  for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement) value = Math.max(value, Number.parseInt(getComputedStyle(parent).zIndex) || 0)
  return value
}
export function HohoSpotlightGuide(props: GuideProps) {
  const live = useRef(props); live.current = props
  const panelRef = useRef<HTMLElement>(null)
  const ownerRef = useRef<HTMLElement | null>(null)
  const [panelHeight, setPanelHeight] = useState(176)
  const [measured, setMeasured] = useState<Measured | null>(null)
  const selectorKey = props.targets.join('|')
  const [compact, setCompact] = useState(false)
  const [forceCompact, setForceCompact] = useState(false)
  const stepKey = props.step + ':' + selectorKey

  useLayoutEffect(() => {
    let frame = 0, stopped = false
    let observed: HTMLElement[] = []
    const resize = new ResizeObserver(() => schedule())
    const read = () => {
      frame = 0
      if (stopped) return
      const elements = live.current.targets.flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(visible)).filter((node, index, list) => list.indexOf(node) === index)
      const container = elements.length ? elements[0].closest<HTMLElement>('[role="dialog"],[role="alertdialog"]') ?? document.body : ownerRef.current?.isConnected ? ownerRef.current : document.body
      if (elements.length) ownerRef.current = container
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]')).filter(visible)
      const top = dialogs.sort((a, b) => layer(a) - layer(b)).at(-1)
      const suspended = Boolean(top && top !== container && !top.contains(elements[0]))
        || Boolean(container !== document.body && container.getAnimations().some(animation => animation.playState === 'running'))
      const visual = window.visualViewport
      const viewport = { left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0, width: visual?.width ?? window.innerWidth, height: visual?.height ?? window.innerHeight }
      const rects = elements.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })
      if (observed.length !== elements.length || observed.some((node, index) => node !== elements[index])) {
        resize.disconnect(); elements.forEach(node => resize.observe(node)); observed = elements
      }
      setCompact(viewport.height < 420)
      setMeasured(previous => {
        if (previous && previous.container === container && previous.suspended === suspended && previous.elements.length === elements.length && previous.elements.every((node, i) => node === elements[i]) && JSON.stringify(previous.rects) === JSON.stringify(rects) && JSON.stringify(previous.viewport) === JSON.stringify(viewport)) return previous
        return { elements, rects, viewport, container, suspended }
      })
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(read) }
    const mutation = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element && record.target.closest('[data-hoho-spotlight]')))) schedule()
    })
    mutation.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'aria-expanded', 'aria-hidden', 'inert', 'data-help-target', 'data-help-editing'] })
    const interact = (event: Event) => {
      if (observed.some(node => event.target instanceof Node && node.contains(event.target))) {
        if (!(event instanceof InputEvent) || !event.isComposing) requestAnimationFrame(() => { if (!stopped) live.current.onInteraction?.(event) })
      }
      schedule()
    }
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    document.addEventListener('animationend', schedule, true)
    for (const name of ['click', 'input', 'change', 'compositionend', 'pointerup']) document.addEventListener(name, interact, true)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    read()
    return () => {
      stopped = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect()
      window.removeEventListener('resize', schedule); document.removeEventListener('scroll', schedule, true); document.removeEventListener('animationend', schedule, true)
      for (const name of ['click', 'input', 'change', 'compositionend', 'pointerup']) document.removeEventListener(name, interact, true)
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule)
    }
  }, [selectorKey])

  useEffect(() => {
    const element = measured?.elements[0]
    if (!element || measured.suspended) return
    const box = element.getBoundingClientRect(), view = measured.viewport
    if (box.top < view.top + 12 || box.bottom > view.top + view.height - 100) element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  }, [stepKey, measured?.elements[0], measured?.viewport.height, measured?.viewport.top])

  useLayoutEffect(() => {
    if (!panelRef.current) return
    const node = panelRef.current, resize = new ResizeObserver(() => setPanelHeight(node.getBoundingClientRect().height))
    resize.observe(node); setPanelHeight(node.getBoundingClientRect().height)
    return () => resize.disconnect()
  }, [measured?.container, measured?.suspended, compact, forceCompact, props.title, props.description])

  useEffect(() => {
    if (!measured || measured.suspended) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); live.current.onExit(); return }
      if (event.key !== 'Tab') return
      const items = [...measured.elements.flatMap(focusables), ...(panelRef.current ? focusables(panelRef.current) : [])].filter((node, i, all) => all.indexOf(node) === i)
      if (!items.length) return
      event.preventDefault(); event.stopImmediatePropagation()
      const current = items.indexOf(document.activeElement as HTMLElement)
      items[(current + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus({ preventScroll: true })
    }
    document.addEventListener('keydown', key, true)
    return () => document.removeEventListener('keydown', key, true)
  }, [measured?.container, measured?.suspended, measured?.elements[0], measured?.elements.length, stepKey])

  useEffect(() => {
    if (!measured?.elements.length || measured.suspended) return
    let next = 0
    const first = requestAnimationFrame(() => { next = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })) })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(next) }
  }, [stepKey, measured?.container, measured?.suspended, Boolean(measured?.elements.length)])

  useEffect(() => { setForceCompact(false) }, [stepKey])
  useEffect(() => { if (measured && !spotlightLayout(measured.rects, measured.viewport, panelHeight).fits) setForceCompact(true) }, [measured, panelHeight])
  if (!measured || measured.suspended) return null
  const layout = spotlightLayout(measured.rects, measured.viewport, panelHeight)
  const rootStyle = { '--guide-left': layout.panel.left + 'px', '--guide-top': layout.panel.top + 'px', '--guide-width': layout.panel.width + 'px' } as CSSProperties
  const hasTargets = measured.elements.length > 0 && layout.holes.length > 0
  // Missing controls never leave an opaque, unclickable page.
  return createPortal(<div data-hoho-spotlight className={'hoho-spotlight' + (compact || forceCompact ? ' is-compact' : '') + (!hasTargets ? ' is-waiting' : '')} style={rootStyle}>
    {hasTargets && layout.fits && <svg className="hoho-spotlight-mask" aria-hidden="true" width={window.innerWidth} height={window.innerHeight}>
      <path d={spotlightPath(window.innerWidth, window.innerHeight, layout.holes)} fillRule="evenodd" onPointerDown={event => event.preventDefault()}/>
      {layout.holes.map((hole, i) => <rect key={i} className="hoho-spotlight-ring" x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx={10}/>)}
    </svg>}
    <aside ref={panelRef} className="hoho-spotlight-panel" aria-label="操作引导" data-placement={layout.placement}>
      <div className="hoho-spotlight-meta"><span>跟着做 · {props.step + 1}/{props.total}</span><HohoButton variant="text" size="small" onClick={props.onExit}>退出引导</HohoButton></div>
      <h2 className="hoho-text-card-title" tabIndex={-1} aria-live="polite">{props.title}</h2>
      <p className="hoho-text-body">{hasTargets ? props.description : '正在找到这一步的位置。你也可以退出引导，继续原来的操作。'}</p>
      <div className="hoho-spotlight-actions">{props.onPrevious && <HohoButton variant="text" onClick={props.onPrevious}>上一步</HohoButton>}{props.onNext ? <HohoButton size="small" disabled={!hasTargets || props.nextDisabled} onClick={props.onNext}>{props.nextLabel ?? '继续'}</HohoButton> : hasTargets && <span className="hoho-text-caption">请点击高亮处操作</span>}</div>
    </aside>
  </div>, measured.container)
}
