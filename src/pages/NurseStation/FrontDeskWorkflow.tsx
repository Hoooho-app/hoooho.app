import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { HohoProgress } from '../../components/design-system'
import { ArrowDown, Check, Copy, Download, FileText, Mic } from '../../components/icons'
import symptomArm from '../../assets/nurse-triage/symptom-arm-20261102.webp'
import nursePortrait from '../../assets/nurse-triage/front-desk-nurse-glasses-20261030.webp'
import './frontDeskWorkflow.css'

const steps = ['出现症状', '说出孩子的情况', '护护帮你问清楚', '确认并保存记录', '整理成完整情况', '保存导出，交给他人或AI']
const durations = [3400, 4500, 4100, 5200, 6500, 5600]
const transcript = '她今天下午手臂起了个小红包，有点痒。'
const motionQuery = '(prefers-reduced-motion: reduce)'

/** Illustrates the existing recording flow; never sends example data or claims rewards. */
export function FrontDeskWorkflow() {
  const root = useRef<HTMLElement>(null)
  const [{ step: playbackStep, elapsed, cycle }, setPlayback] = useState({ step: 0, elapsed: 0, cycle: 0 })
  const [heights, setHeights] = useState<number[]>([])
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
  const [blocked, setBlocked] = useState(true)
  const [reduced, setReduced] = useState(() => matchMedia(motionQuery).matches)

  useLayoutEffect(() => {
    const scenes = [...root.current!.querySelectorAll<HTMLElement>('.front-desk-workflow__scene')]
    const measure = () => {
      const next = scenes.map(scene => scene.offsetHeight)
      setHeights(previous => next.every((height, index) => height === previous[index]) ? previous : next)
    }
    const observer = new ResizeObserver(measure)
    scenes.forEach(scene => observer.observe(scene))
    measure()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const media = matchMedia(motionQuery)
    let pressed = false
    let visible = false
    let listening = true
    const sync = () => {
      if (!listening) return
      const footer = document.querySelector('.smart-record-home .smart-record-page__footer')
      const active = document.activeElement
      const editing = active instanceof Element && footer?.contains(active) && active.matches('input,textarea,[contenteditable="true"]')
      const draft = [...footer?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea') ?? []].some(input => input.value.trim().length > 0)
      setBlocked(document.hidden || !visible || pressed || Boolean(editing) || draft || Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')))
    }
    const motion = () => setReduced(media.matches)
    const down = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && ![' ', 'Enter'].includes(event.key)) return
      if (event.target instanceof Element && event.target.closest('.smart-record-page__footer')) { pressed = true; sync() }
    }
    const up = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && ![' ', 'Enter', 'Escape'].includes(event.key)) return
      pressed = false; sync()
    }
    const blur = () => queueMicrotask(sync)
    const visibility = () => { if (document.hidden) pressed = false; sync() }
    const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; sync() }, { threshold: .25 })
    if (root.current) intersection.observe(root.current)
    const dialogs = new MutationObserver(sync)
    dialogs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] })
    media.addEventListener('change', motion)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('focusin', sync)
    document.addEventListener('focusout', blur)
    document.addEventListener('input', sync)
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', down)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    document.addEventListener('lostpointercapture', up)
    document.addEventListener('keyup', up)
    sync()
    return () => {
      listening = false
      intersection.disconnect()
      dialogs.disconnect()
      media.removeEventListener('change', motion)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('focusin', sync)
      document.removeEventListener('focusout', blur)
      document.removeEventListener('input', sync)
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', down)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      document.removeEventListener('lostpointercapture', up)
      document.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    if (blocked || paused || reduced) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = Math.min(250, Math.max(0, now - last))
      last = now
      setPlayback(previous => {
        const elapsed = previous.elapsed + delta
        if (elapsed < durations[previous.step]) return { ...previous, elapsed }
        return previous.step === steps.length - 1
          ? { step: 0, elapsed: 0, cycle: previous.cycle + 1 }
          : { ...previous, step: previous.step + 1, elapsed: 0 }
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [blocked, paused, reduced])

  const step = reduced ? steps.length - 1 : playbackStep
  const playing = !reduced && !paused && !blocked
  const saved = step !== 3 || elapsed >= 3800
  const previous = !reduced && (step > 0 || cycle > 0) ? (step + steps.length - 1) % steps.length : -1
  const sceneProps = (index: number) => ({
    'data-state': index === step ? 'current' : index === previous ? 'previous' : 'outside',
    'aria-hidden': index !== step,
  })
  const travel = ((heights[step] ?? 0) + (heights[previous] ?? 0)) / 2
  return <article ref={root} className="front-desk-welcome__entry front-desk-workflow" aria-label="怎么用护护：虚构情景示意" aria-description="自动循环；鼠标悬停或键盘聚焦可暂停阅读" tabIndex={0} data-step={step} data-playing={playing}
    data-motion={reduced ? 'reduced' : 'scroll'} style={{ '--workflow-travel': `${travel}px`, '--workflow-min-height': `${Math.max(248, ...heights)}px` } as CSSProperties}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true) }} onPointerLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
    <div className="front-desk-workflow__stage" aria-label="虚构情景演示，不代表实际记录">
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[0]} {...sceneProps(0)}>
        <div className="front-desk-workflow__panel front-desk-workflow__case">
          <img src={symptomArm} alt="小手臂上起了一个小红包" width={600} height={400}/>
          <strong>出现症状</strong>
        </div>
        <div className="front-desk-workflow__connector" aria-hidden="true"><ArrowDown size={14}/></div>
      </div>
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[1]} {...sceneProps(1)}>
        <div className="front-desk-workflow__panel front-desk-workflow__voice">
          <div className="front-desk-workflow__microphone"><Mic size={14} aria-hidden="true"/><span>你说</span></div>
          <div className="front-desk-workflow__wave" aria-hidden="true">{[9, 17, 25, 15, 30, 21, 34, 24, 14, 26, 18, 10].map((height, index) => <span key={index} style={{ '--wave-height': `${height}px`, '--wave-delay': `${index * 55}ms` } as CSSProperties}/>)}</div>
          <p aria-label={transcript}>{Array.from(transcript).map((character, index) => <span key={index} aria-hidden="true" style={{ '--character-delay': `${850 + index * 95}ms` } as CSSProperties}>{character}</span>)}</p>
        </div>
        <div className="front-desk-workflow__connector" aria-hidden="true"><ArrowDown size={14}/></div>
      </div>
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[2]} {...sceneProps(2)}>
        <div className="front-desk-workflow__panel front-desk-workflow__reply"><div className="front-desk-workflow__nurse"><img src={nursePortrait} alt="护护记录员" width={480} height={786}/><span>护护</span></div><p>具体起在手臂哪里？</p><div className="front-desk-workflow__answer"><span>你补充</span><strong>左前臂</strong></div></div>
        <div className="front-desk-workflow__connector" aria-hidden="true"><ArrowDown size={14}/></div>
      </div>
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[3]} {...sceneProps(3)} data-saved={saved}>
        <div className="front-desk-workflow__panel front-desk-workflow__record">
          <div className="front-desk-workflow__record-head">记录单<span>{saved ? '已保存' : '待核对'}</span></div>
          <dl>{[['时间', '今天下午'], ['部位', '左前臂'], ['表现', '小红包、痒']].map(([label, value], index) => <div key={label} style={{ '--row-delay': `${1000 + index * 350}ms` } as CSSProperties}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <div className="front-desk-workflow__save" aria-hidden="true">{saved ? <><Check size={14}/>已保存</> : '确认并保存'}</div>
        </div>
        <div className="front-desk-workflow__connector" aria-hidden="true"><ArrowDown size={14}/></div>
      </div>
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[4]} {...sceneProps(4)}>
        <div className="front-desk-workflow__panel front-desk-workflow__summary" aria-label="情况单页面结构">
          <div className="front-desk-workflow__summary-title"><FileText size={15} aria-hidden="true"/><strong>就诊情况单</strong></div>
          <div className="front-desk-workflow__identity"><span>孩子信息</span><strong>女儿 · 2岁</strong></div>
          <ol className="front-desk-workflow__outline" aria-label="情况单栏目">
            {['主诉', '现病史', '体格情况', '本次想问'].map((title, index) => <li key={title} style={{ '--row-delay': `${900 + index * 450}ms` } as CSSProperties}><span>{title}</span></li>)}
          </ol>
        </div>
        <div className="front-desk-workflow__connector" aria-hidden="true"><ArrowDown size={14}/></div>
      </div>
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[5]} {...sceneProps(5)}>
        <div className="front-desk-workflow__panel front-desk-workflow__export-file">
          <FileText size={25} aria-hidden="true"/><strong>情况单已整理</strong><span>保存 · 导出</span>
          <div className="front-desk-workflow__handoffs">
            <div className="front-desk-workflow__handoff" style={{ '--row-delay': '1100ms' } as CSSProperties}><div><Download size={15} aria-hidden="true"/><strong>保存情况单</strong></div><span>给家人、医生看</span></div>
            <div className="front-desk-workflow__handoff" style={{ '--row-delay': '2100ms' } as CSSProperties}><div><Copy size={15} aria-hidden="true"/><strong>复制给 AI</strong></div><span>带着资料提问</span></div>
          </div>
        </div>
        <div className="front-desk-workflow__connector" aria-hidden="true"><ArrowDown size={14}/></div>
      </div>
    </div>
    <HohoProgress className="front-desk-workflow__progress" segmented max={steps.length} value={reduced ? steps.length : step + elapsed / durations[step]} label={`虚构使用情景，第${step + 1}步，共${steps.length}步`}/>
  </article>
}
