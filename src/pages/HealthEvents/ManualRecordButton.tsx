import { PenLine } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { HohoButton } from '../../components/design-system'
import { MANUAL_RECORD_PROMPTS } from './manualRecordPrompts'

const CHARACTER_DELAY_MS = 92
const COMPLETE_HOLD_MS = 2100
const EMPTY_HOLD_MS = 520

type ManualRecordButtonProps = Omit<ComponentProps<typeof HohoButton>, 'children' | 'size' | 'variant'>

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

export function ManualRecordButton({ className = '', ...props }: ManualRecordButtonProps) {
  const reducedMotion = useReducedMotion()
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const [prompt, setPrompt] = useState('')
  const promptIndexRef = useRef(0)
  const windowRef = useRef<HTMLSpanElement>(null)
  const trackRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const handleVisibility = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      setPrompt(MANUAL_RECORD_PROMPTS[0])
      return
    }
    if (!pageVisible) return

    let cancelled = false
    let timer: number | undefined
    const schedule = (callback: () => void, delay: number) => {
      timer = window.setTimeout(() => {
        if (!cancelled && !document.hidden) callback()
      }, delay)
    }
    const typePrompt = (characterIndex: number) => {
      const phrase = MANUAL_RECORD_PROMPTS[promptIndexRef.current]
      if (characterIndex < phrase.length) {
        setPrompt(phrase.slice(0, characterIndex + 1))
        schedule(() => typePrompt(characterIndex + 1), CHARACTER_DELAY_MS)
        return
      }
      schedule(() => {
        setPrompt('')
        promptIndexRef.current = (promptIndexRef.current + 1) % MANUAL_RECORD_PROMPTS.length
        schedule(() => typePrompt(0), EMPTY_HOLD_MS)
      }, COMPLETE_HOLD_MS)
    }

    setPrompt('')
    schedule(() => typePrompt(0), EMPTY_HOLD_MS)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [pageVisible, reducedMotion])

  useLayoutEffect(() => {
    const phraseWindow = windowRef.current
    const phraseTrack = trackRef.current
    if (!phraseWindow || !phraseTrack) return
    const overflow = reducedMotion ? 0 : Math.max(0, phraseTrack.scrollWidth - phraseWindow.clientWidth)
    phraseTrack.style.transform = `translateX(${-overflow}px)`
  }, [prompt, reducedMotion])

  return (
    <HohoButton
      {...props}
      aria-label="手动记录"
      className={`journal-manual-record-action ${className}`.trim()}
      size="large"
      variant="secondary"
    >
      <span aria-hidden="true" className="journal-manual-record-action__visual">
        <PenLine className="journal-manual-record-action__icon" size={20} />
        <span className="journal-manual-record-action__label">记录</span>
        <span className="journal-manual-record-action__underscore">_</span>
        <span className="journal-manual-record-action__prompt-window" ref={windowRef}>
          <span className="journal-manual-record-action__prompt-track" ref={trackRef}>
            <span>{prompt}</span>
            <span className="journal-manual-record-action__caret" />
          </span>
        </span>
      </span>
    </HohoButton>
  )
}
