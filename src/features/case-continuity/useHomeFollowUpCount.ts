import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { readHomeReading, writeHomeReading } from '../../pages/NurseStation/homeReadings'
import { caseService } from './api'

export function useHomeFollowUpCount() {
  const memberId = useAppStore(s => s.currentMemberId), token = useAppStore(s => s.authToken) ?? ''
  const scope = `${token}:${memberId}`
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{ scope: string; count?: number; status: 'loading' | 'success' | 'error' }>(() => ({ scope, count: readHomeReading(token, memberId, 'followUpCount'), status: 'loading' }))
  useEffect(() => {
    const controller = new AbortController()
    setState({ scope, count: readHomeReading(token, memberId, 'followUpCount'), status: 'loading' })
    if (token && memberId) void caseService.list(memberId, token, controller.signal).then(data => {
      if (controller.signal.aborted) return
      const count = data.active.length
      writeHomeReading(token, memberId, 'followUpCount', count)
      setState({ scope, count, status: 'success' })
    }).catch(() => {
      if (!controller.signal.aborted) setState(current => ({ scope, count: current.scope === scope ? current.count : undefined, status: 'error' }))
    })
    return () => controller.abort()
  }, [memberId, token, scope, version])
  return { count: state.scope === scope ? state.count : undefined, status: state.scope === scope ? state.status : 'loading', reload: () => setVersion(v => v + 1) }
}
