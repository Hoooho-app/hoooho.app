import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { HohoButton, HohoProgress } from '../../components/design-system'
import { ArrowDown, Check, CircleCheck, FileText, History, MessageCircle, Mic, Thermometer } from '../../components/icons'
import careRecordingImage from '../../assets/nurse-triage/care-recording-20261029.webp'
import nursePortrait from '../../assets/nurse-triage/front-desk-nurse-glasses-20261030.webp'
import './frontDeskWorkflow.css'

const steps = ['出现症状', '说出孩子的情况', '护护帮你问清楚', '确认并保存记录', '补充变化，回看记录']
const durations = [3400, 4500, 4100, 5200, 4700]
const transcript = '她今天下午开始发热，没什么精神。'
const motionQuery = '(prefers-reduced-motion: reduce)'

function Origin({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return <><div className="front-desk-workflow__origin">{icon}<span>{children}</span></div><div className="front-desk-workflow__connector" aria-hidden="true"><ArrowDown size={14}/></div></>
}

/** Illustrates the existing recording flow; never sends example data or claims rewards. */
export function FrontDeskWorkflow() {
  const root = useRef<HTMLElement>(null)
  const [{ step, elapsed, complete }, setPlayback] = useState({ step: 0, elapsed: 0, complete: false })
  const [paused, setPaused] = useState(false)
  const [blocked, setBlocked] = useState(true)
  const [reduced, setReduced] = useState(() => matchMedia(motionQuery).matches)

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
    if (blocked || paused || reduced || complete) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = Math.min(250, Math.max(0, now - last))
      last = now
      setPlayback(previous => {
        if (previous.complete) return previous
        const elapsed = previous.elapsed + delta
        if (elapsed < durations[previous.step]) return { ...previous, elapsed }
        return previous.step === steps.length - 1
          ? { ...previous, elapsed: durations[previous.step], complete: true }
          : { step: previous.step + 1, elapsed: 0, complete: false }
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [blocked, paused, reduced, complete])

  const playing = !complete && !reduced && !paused && !blocked
  const saved = step === 3 && (reduced || elapsed >= 3800)
  const replay = complete || reduced && step === steps.length - 1
  const controlLabel = replay ? '重播使用流程' : reduced ? '查看下一步使用流程' : paused ? '继续使用流程动画' : '暂停使用流程动画'
  return <article ref={root} className="front-desk-welcome__entry front-desk-workflow" aria-label="怎么用护护：情景演示" data-step={complete ? 'complete' : step} data-playing={playing}>
    <div className="front-desk-workflow__header">
      <span className="front-desk-welcome__eyebrow">怎么用护护</span>
      <HohoButton size="small" variant="text" aria-label={controlLabel} onClick={() => {
        if (replay) { setPlayback({ step: 0, elapsed: 0, complete: false }); setPaused(false) }
        else if (reduced) setPlayback(previous => ({ step: previous.step + 1, elapsed: 0, complete: false }))
        else setPaused(value => !value)
      }}>{replay ? '重播' : reduced ? '下一步' : paused ? '继续' : '暂停'}</HohoButton>
    </div>
    <div className="front-desk-workflow__stage" aria-label="虚构情景演示，不代表实际记录">
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[0]} hidden={step !== 0}>
        <div className="front-desk-workflow__panel front-desk-workflow__case">
          <span className="front-desk-workflow__case-label"><Thermometer size={15} aria-hidden="true"/>出现症状</span>
          <strong>她好像发热了</strong><span className="front-desk-workflow__note">下午开始，没什么精神</span>
          <img src={careRecordingImage} alt="妈妈照顾不舒服的孩子" width={520} height={488}/>
        </div>
        <span className="front-desk-workflow__case-next"><ArrowDown size={14} aria-hidden="true"/>直接跟护护说</span>
      </div>
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[1]} hidden={step !== 1}>
        <Origin icon={<Thermometer size={14} aria-hidden="true"/>}>下午开始发热</Origin>
        <div className="front-desk-workflow__panel front-desk-workflow__voice front-desk-workflow__arrival">
          <div className="front-desk-workflow__microphone"><Mic size={14} aria-hidden="true"/><span>你说</span></div>
          <div className="front-desk-workflow__wave" aria-hidden="true">{[9, 17, 25, 15, 30, 21, 34, 24, 14, 26, 18, 10].map((height, index) => <span key={index} style={{ '--wave-height': `${height}px`, '--wave-delay': `${index * 55}ms` } as CSSProperties}/>)}</div>
          <p aria-label={transcript}>{Array.from(transcript).map((character, index) => <span key={index} aria-hidden="true" style={{ '--character-delay': `${850 + index * 95}ms` } as CSSProperties}>{character}</span>)}</p>
        </div>
      </div>
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[2]} hidden={step !== 2}>
        <Origin icon={<MessageCircle size={14} aria-hidden="true"/>}>说了发热、没精神</Origin>
        <div className="front-desk-workflow__reply front-desk-workflow__arrival"><div className="front-desk-workflow__nurse"><img src={nursePortrait} alt="护护记录员" width={480} height={786}/><span>护护</span></div><p>现在量到的体温是多少？</p></div>
        <div className="front-desk-workflow__panel front-desk-workflow__temperature"><span>体温</span><strong>38.2<small>℃</small></strong></div>
      </div>
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[3]} hidden={step !== 3} data-saved={saved}>
        <Origin icon={<FileText size={14} aria-hidden="true"/>}>整理成记录单</Origin>
        <div className="front-desk-workflow__panel front-desk-workflow__record front-desk-workflow__arrival">
          <div className="front-desk-workflow__record-head">记录单<span>{saved ? '已保存' : '待核对'}</span></div>
          <dl>{[['时间', '今天下午'], ['情况', '发热、没精神'], ['体温', '38.2 ℃']].map(([label, value], index) => <div key={label} style={{ '--row-delay': `${1000 + index * 350}ms` } as CSSProperties}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <div className="front-desk-workflow__save" aria-hidden="true">{saved ? <><Check size={14}/>已保存</> : '确认并保存'}</div>
        </div>
      </div>
      <div className="front-desk-workflow__scene" role="group" aria-label={steps[4]} hidden={step !== 4}>
        <Origin icon={<CircleCheck size={14} aria-hidden="true"/>}>记录已保存</Origin>
        <div className="front-desk-workflow__panel front-desk-workflow__history front-desk-workflow__arrival"><div className="front-desk-workflow__history-title"><History size={14} aria-hidden="true"/>这次的变化</div><div className="front-desk-workflow__event"><span>下午 · 发热</span><strong>38.2 ℃</strong></div><div className="front-desk-workflow__event"><span>傍晚 · 补充</span><strong>37.5 ℃</strong></div></div>
      </div>
      <span className="front-desk-workflow__demo-label">演示</span>
    </div>
    <HohoProgress className="front-desk-workflow__progress" segmented max={5} value={complete ? 5 : step + (reduced ? 1 : elapsed / durations[step])} label={`使用演示，第${step + 1}步，共5步`}/>
  </article>
}
