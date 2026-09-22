import { useCallback, useEffect, useRef, useState } from 'react'
import { routineTrackService, type RoutineDay } from '../../services/routineTracks'

const emptyDay: RoutineDay = { consent: 'unset', template: null, tracks: [] }

export function useRoutineTracks(memberId: string, day: string, token: string, revision: number) {
  const [data, setData] = useState<RoutineDay>(emptyDay)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  const load = useCallback((signal?: AbortSignal) => {
    if (!memberId || !token) { setData(emptyDay); setLoading(false); return Promise.resolve() }
    const request = ++requestRef.current
    setLoading(true)
    setError('')
    return routineTrackService.getDay(memberId, day, token, signal).then((next) => {
      if (request === requestRef.current) setData(next)
    }).catch((reason: unknown) => {
      if (signal?.aborted || request !== requestRef.current) return
      setError(reason instanceof Error ? reason.message : '日常作息加载失败')
    }).finally(() => { if (request === requestRef.current) setLoading(false) })
  }, [day, memberId, token])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, revision])

  return { data, loading, error, retry: () => load() }
}
