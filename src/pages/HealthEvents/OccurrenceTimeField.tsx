import { useCallback, useEffect, useRef, useState } from 'react'
import { FUTURE_OCCURRED_AT_MESSAGE, localDateTimeValue } from '../../utils/healthOccurredAt'
import { captureOccurrenceTime, formatOccurrenceTimeLabel, occurrenceInitialState, type OccurrenceTimeMode } from './occurrenceTimeModel'

export function useOccurrenceTime(selectedDay: string, today: string, initialOccurredAt?: string) {
  const initial = useRef(occurrenceInitialState(selectedDay, today, initialOccurredAt))
  const [mode, setModeState] = useState<OccurrenceTimeMode>(initial.current.mode)
  const [specifiedValue, setSpecifiedValueState] = useState(initial.current.value)
  const [now, setNow] = useState(() => new Date())
  const [error, setError] = useState('')
  const capturedRef = useRef('')

  useEffect(() => {
    if (mode !== 'now') return
    let timer = 0
    const update = () => setNow(new Date())
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { update(); schedule() }, 60_000 - Date.now() % 60_000 + 20)
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') { update(); schedule() } }
    schedule()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [mode])

  const resetCapture = useCallback(() => { capturedRef.current = ''; setError('') }, [])
  const setMode = useCallback((next: OccurrenceTimeMode) => { resetCapture(); setModeState(next); if (next === 'now') setNow(new Date()) }, [resetCapture])
  const setSpecifiedValue = useCallback((value: string) => { resetCapture(); setSpecifiedValueState(value); setModeState('specified') }, [resetCapture])
  const capture = useCallback(() => {
    if (capturedRef.current) return capturedRef.current
    try {
      const value = captureOccurrenceTime(mode, specifiedValue, new Date())
      capturedRef.current = value
      setError('')
      return value
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : FUTURE_OCCURRED_AT_MESSAGE)
      return null
    }
  }, [mode, specifiedValue])
  return { mode, specifiedValue, now, error, today, setMode, setSpecifiedValue, capture }
}

export function OccurrenceTimeField({ model, label = '发生时间', onValueChange, showDateContext = false }: { model: ReturnType<typeof useOccurrenceTime>; label?: string; onValueChange?: (value: string) => void; showDateContext?: boolean }) {
  const value = model.mode === 'now' ? localDateTimeValue(model.now) : model.specifiedValue
  return <section className="occurrence-time-field" aria-labelledby="occurrence-time-label">
    <strong id="occurrence-time-label">{label}</strong>
    <label className="occurrence-time-control"><span aria-hidden="true">{formatOccurrenceTimeLabel(value, model.today, showDateContext)} ›</span><input aria-describedby={model.error ? 'occurrence-time-error' : undefined} aria-invalid={Boolean(model.error)} aria-label={label} max={localDateTimeValue()} onChange={(event) => { onValueChange?.(event.target.value); event.target.value ? model.setSpecifiedValue(event.target.value) : model.setMode('now') }} type="datetime-local" value={value} /></label>
    {model.error && <p className="occurrence-time-error" id="occurrence-time-error" role="alert">{model.error}</p>}
  </section>
}
