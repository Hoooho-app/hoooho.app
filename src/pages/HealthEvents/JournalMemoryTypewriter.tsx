import { useEffect, useRef, useState } from 'react'
import { journalMemoryCopies } from './journalMemoryCopies'

const TYPE_DELAY = 30
const HOLD_DELAY = 1650
const EMPTY_DELAY = 220

export function JournalMemoryTypewriter() {
  const [phraseIndex, setPhraseIndex] = useState(() => Math.floor(Math.random() * journalMemoryCopies.length))
  const [visibleLength, setVisibleLength] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    if (reducedMotion) { setVisibleLength(journalMemoryCopies[phraseIndex].length); return }
    if (!pageVisible) return
    const phrase = journalMemoryCopies[phraseIndex]
    const advance = () => {
      if (visibleLength < phrase.length) setVisibleLength((length) => length + 1)
      else if (visibleLength === phrase.length) setVisibleLength(-1)
      else { setVisibleLength(0); setPhraseIndex((index) => (index + 1) % journalMemoryCopies.length) }
    }
    const delay = visibleLength < phrase.length ? TYPE_DELAY : visibleLength === phrase.length ? HOLD_DELAY : EMPTY_DELAY
    timeoutRef.current = window.setTimeout(advance, delay)
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    }
  }, [pageVisible, phraseIndex, reducedMotion, visibleLength])

  const visibleText = journalMemoryCopies[phraseIndex].slice(0, Math.max(0, visibleLength))
  return <div className="journal-memory-typewriter" aria-label="日常记录可以帮助补全孩子的健康情况">
    <span aria-hidden="true" className="journal-memory-cursor">_</span>
    <span aria-hidden="true" className="journal-memory-typed-copy">{visibleText}</span>
  </div>
}
