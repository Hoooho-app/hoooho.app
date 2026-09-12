import { useEffect, useRef, useState } from 'react'

export const nurseStationFacts = [
  '全球食物过敏率约3%～8%',
  '约1/4人群受各类过敏疾病影响',
  '中国2岁内儿童食物过敏检出率约3.5%～7.7%',
  '过敏反应可能涉及多个身体系统',
  '时间、诱因和频率都是重要线索',
  '你已经更早一步留下判断线索'
] as const

const TYPE_DELAY = 28
const HOLD_DELAY = 1750
const EMPTY_DELAY = 240

function highlighted(text: string) {
  return text.split(/(\d+(?:\.\d+)?%?(?:～\d+(?:\.\d+)?%)?)/g).map((part, index) => /\d/.test(part) ? <strong key={`${part}-${index}`}>{part}</strong> : part)
}

export function NurseStationFactTypewriter() {
  const [factIndex, setFactIndex] = useState(0)
  const [visibleLength, setVisibleLength] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    const fact = nurseStationFacts[factIndex]
    if (reducedMotion) { setVisibleLength(fact.length); return }
    const advance = () => {
      if (visibleLength < fact.length) setVisibleLength((length) => length + 1)
      else if (visibleLength === fact.length) setVisibleLength(-1)
      else { setVisibleLength(0); setFactIndex((index) => (index + 1) % nurseStationFacts.length) }
    }
    timeoutRef.current = window.setTimeout(advance, visibleLength < fact.length ? TYPE_DELAY : visibleLength === fact.length ? HOLD_DELAY : EMPTY_DELAY)
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current) }
  }, [factIndex, reducedMotion, visibleLength])

  const visibleText = nurseStationFacts[factIndex].slice(0, Math.max(0, visibleLength))
  return <p aria-label={nurseStationFacts[factIndex]} className="nurse-station-fact"><span aria-hidden="true">{highlighted(visibleText)}</span><i aria-hidden="true" /></p>
}
