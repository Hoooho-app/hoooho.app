import { useEffect, useRef, useState } from 'react'

export const nurseStationFacts = [
  '全球食物过敏率约3%～8%',
  '低龄儿童更容易发生食物过敏',
  '时间、诱因和频率都是重要线索',
  '早点留下记录，就能少一点麻烦'
] as const

const TYPE_DELAY = 28
const HOLD_DELAY = 1750
const DELETE_DELAY = 16
const EMPTY_DELAY = 240

function highlighted(text: string) {
  return text.split(/(\d+(?:\.\d+)?%?(?:～\d+(?:\.\d+)?%)?)/g).map((part, index) => /\d/.test(part) ? <strong key={`${part}-${index}`}>{part}</strong> : part)
}

interface TypewriterProps {
  facts?: readonly string[]
  className?: string
  prefix?: string
  highlightNumbers?: boolean
  reduceMotion?: boolean
  clearOnComplete?: boolean
  timing?: { type: number; hold: number; delete: number; empty: number }
}

export function NurseStationFactTypewriter({ facts = nurseStationFacts, className = 'nurse-station-fact', prefix = '', highlightNumbers = true, reduceMotion = false, clearOnComplete = false, timing }: TypewriterProps = {}) {
  const [factIndex, setFactIndex] = useState(0)
  const [visibleLength, setVisibleLength] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    const fact = facts[factIndex]
    if (!fact) return
    if (reducedMotion || reduceMotion) return
    if (!visible) return
    const advance = () => {
      if (visibleLength < fact.length && visibleLength >= 0) setVisibleLength((length) => length + 1)
      else if (visibleLength === fact.length) setVisibleLength(clearOnComplete ? -1 : -(fact.length + 1))
      else if (visibleLength < -1) setVisibleLength((length) => length + 1)
      else { setVisibleLength(0); setFactIndex((index) => (index + 1) % facts.length) }
    }
    const delay = visibleLength >= 0 && visibleLength < fact.length
      ? timing?.type ?? TYPE_DELAY
      : visibleLength === fact.length
        ? timing?.hold ?? HOLD_DELAY
        : visibleLength < -1
          ? timing?.delete ?? DELETE_DELAY
          : timing?.empty ?? EMPTY_DELAY
    timeoutRef.current = window.setTimeout(advance, delay)
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current) }
  }, [factIndex, facts, reducedMotion, reduceMotion, visible, visibleLength, timing, clearOnComplete])

  const fact = facts[factIndex] ?? ''
  const staticText = reducedMotion || reduceMotion
  const visibleText = staticText ? fact : visibleLength >= 0 ? fact.slice(0, visibleLength) : fact.slice(0, Math.abs(visibleLength) - 1)
  return <span aria-label={`${prefix}${fact}`} className={className} data-typewriter-index={factIndex} data-typewriter-static={staticText || undefined}><span aria-hidden="true">{prefix}{highlightNumbers ? highlighted(visibleText) : visibleText}<i /></span></span>
}
