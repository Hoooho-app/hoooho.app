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
      if (visibleLength < fact.length && visibleLength >= 0) setVisibleLength((length) => length + 1)
      else if (visibleLength === fact.length) setVisibleLength(-(fact.length + 1))
      else if (visibleLength < -1) setVisibleLength((length) => length + 1)
      else { setVisibleLength(0); setFactIndex((index) => (index + 1) % nurseStationFacts.length) }
    }
    const delay = visibleLength >= 0 && visibleLength < fact.length
      ? TYPE_DELAY
      : visibleLength === fact.length
        ? HOLD_DELAY
        : visibleLength < -1
          ? DELETE_DELAY
          : EMPTY_DELAY
    timeoutRef.current = window.setTimeout(advance, delay)
    return () => { if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current) }
  }, [factIndex, reducedMotion, visibleLength])

  const visibleText = visibleLength >= 0
    ? nurseStationFacts[factIndex].slice(0, visibleLength)
    : nurseStationFacts[factIndex].slice(0, Math.abs(visibleLength) - 1)
  return <p aria-label={nurseStationFacts[factIndex]} className="nurse-station-fact"><span aria-hidden="true">{highlighted(visibleText)}<i /></span></p>
}
