import { useEffect, useState } from 'react'
import {
  canScheduleNursePromptAdvance,
  nextNursePromptIndex,
  nursePromptHoldDuration,
  nursePromptMessages,
  nursePromptReducedTransitionDuration,
  nursePromptTransitionDuration
} from './nursePromptMessages'

interface NursePromptCarouselProps {
  paused: boolean
  reducedMotion: boolean
}

export function NursePromptCarousel({ paused, reducedMotion }: NursePromptCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [incomingIndex, setIncomingIndex] = useState<number | null>(null)
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')

  useEffect(() => {
    const handleVisibilityChange = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    if (!canScheduleNursePromptAdvance(paused, pageVisible, incomingIndex !== null)) return
    const timer = window.setTimeout(() => {
      setIncomingIndex(nextNursePromptIndex(currentIndex))
    }, nursePromptHoldDuration)
    return () => window.clearTimeout(timer)
  }, [currentIndex, incomingIndex, pageVisible, paused])

  useEffect(() => {
    if (incomingIndex === null) return
    const timer = window.setTimeout(() => {
      setCurrentIndex(incomingIndex)
      setIncomingIndex(null)
    }, reducedMotion ? nursePromptReducedTransitionDuration : nursePromptTransitionDuration)
    return () => window.clearTimeout(timer)
  }, [incomingIndex, reducedMotion])

  const transitioning = incomingIndex !== null

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="nurse-prompt-carousel"
      data-reduced-motion={reducedMotion}
      data-transitioning={transitioning}
    >
      <span
        aria-hidden={transitioning}
        className={`nurse-prompt-carousel__line${transitioning ? ' is-leaving' : ' is-current'}`}
      >
        {nursePromptMessages[currentIndex]}
      </span>
      {incomingIndex !== null && (
        <span className="nurse-prompt-carousel__line is-entering">
          {nursePromptMessages[incomingIndex]}
        </span>
      )}
    </div>
  )
}
