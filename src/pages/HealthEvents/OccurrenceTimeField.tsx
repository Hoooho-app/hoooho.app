import { useCallback, useEffect, useRef, useState } from 'react'
import { HohoInput } from '../../components/design-system'
import { FUTURE_OCCURRED_AT_MESSAGE, localDateTimeValue } from '../../utils/healthOccurredAt'
import { captureOccurrenceTime, occurrenceInitialState, type OccurrenceTimeMode } from './occurrenceTimeModel'

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
      timer = window.setTimeout(() => { update(); schedule() }, 1000 - Date.now() % 1000 + 20)
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
  return { mode, specifiedValue, now, error, setMode, setSpecifiedValue, capture }
}

function clockLabel(date: Date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join(':')
}

export function OccurrenceTimeField({ model, label = '发生时间' }: { model: ReturnType<typeof useOccurrenceTime>; label?: string }) {
  return <section className="occurrence-time-field" aria-labelledby="occurrence-time-label">
    <div className="occurrence-time-heading"><strong id="occurrence-time-label">{label}</strong><div aria-label="发生时间模式" role="group"><button aria-pressed={model.mode === 'now'} onClick={() => model.setMode('now')} type="button">现在</button><button aria-pressed={model.mode === 'specified'} onClick={() => model.setMode('specified')} type="button">指定时间</button></div></div>
    {model.mode === 'now'
      ? <output aria-label="当前发生时间" className="occurrence-time-now">{clockLabel(model.now)}</output>
      : <HohoInput error={model.error || undefined} label="指定日期和时间" max={localDateTimeValue()} onChange={(event) => model.setSpecifiedValue(event.target.value)} type="datetime-local" value={model.specifiedValue} />}
    {model.mode === 'now' && model.error && <p className="occurrence-time-error" role="alert">{model.error}</p>}
  </section>
}
