import { useEffect, useRef, useState } from 'react'

export const nurseStationFacts = [
  '全球食物过敏发生率约为 3%～8%',
  '全球约 25% 的人群受到各类过敏性疾病影响',
  '中国 2 岁以内儿童食物过敏检出率约为 3.5%～7.7%',
  '食物过敏可能同时影响皮肤、消化道和呼吸系统',
  '症状发生的时间诱因和频率都是重要判断线索',
  '你已经更早一步为孩子留下了判断线索'
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
