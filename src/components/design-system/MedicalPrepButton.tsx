import { useCallback, useEffect, useRef, useState } from 'react'
import logoUrl from '../../assets/logo.svg'
import { HohoButton } from './HohoButton'
import type { HohoButtonProps } from './HohoButton'

const FIRST_WAKE_DELAY = 3_000
const REPEAT_WAKE_DELAY = 12_000
const WAKE_DURATION = 1_650

export type MedicalPrepButtonProps = Omit<HohoButtonProps, 'children'>

export function MedicalPrepButton({ className = '', disabled = false, onClick, ...props }: MedicalPrepButtonProps) {
  const [awake, setAwake] = useState(false)
  const scheduleRef = useRef<number | null>(null)
  const finishRef = useRef<number | null>(null)
  const mountedRef = useRef(false)

  const clearTimers = useCallback(() => {
    if (scheduleRef.current !== null) window.clearTimeout(scheduleRef.current)
    if (finishRef.current !== null) window.clearTimeout(finishRef.current)
    scheduleRef.current = null
    finishRef.current = null
  }, [])

  const motionAllowed = useCallback(() => (
    !disabled && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ), [disabled])

  const schedule = useCallback((delay: number) => {
    clearTimers()
    setAwake(false)
    if (!motionAllowed()) return
    scheduleRef.current = window.setTimeout(() => {
      if (!mountedRef.current || !motionAllowed()) return
      setAwake(true)
      finishRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return
        setAwake(false)
        schedule(REPEAT_WAKE_DELAY)
      }, WAKE_DURATION)
    }, delay)
  }, [clearTimers, motionAllowed])

  useEffect(() => {
    mountedRef.current = true
    schedule(FIRST_WAKE_DELAY)
    const resetAfterInteraction = () => schedule(REPEAT_WAKE_DELAY)
    const handleVisibility = () => {
      if (document.hidden) clearTimers()
      else schedule(FIRST_WAKE_DELAY)
    }
    const events: (keyof WindowEventMap)[] = ['wheel', 'pointerdown', 'touchstart', 'touchmove', 'keydown', 'input']
    events.forEach((event) => window.addEventListener(event, resetAfterInteraction, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      mountedRef.current = false
      clearTimers()
      events.forEach((event) => window.removeEventListener(event, resetAfterInteraction, { capture: true }))
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [clearTimers, schedule])

  return (
    <HohoButton
      {...props}
      className={`medical-prep-button ${awake ? 'medical-prep-button--awake' : ''} ${className}`.trim()}
      disabled={disabled}
      onClick={(event) => {
        schedule(REPEAT_WAKE_DELAY)
        onClick?.(event)
      }}
    >
      <span aria-hidden="true" className="medical-prep-button__icon">
        <img alt="" height={20} src={logoUrl} width={20} />
        <i className="medical-prep-button__spark medical-prep-button__spark--one" />
        <i className="medical-prep-button__spark medical-prep-button__spark--two" />
      </span>
      <span className="medical-prep-button__label">就医准备</span>
    </HohoButton>
  )
}
