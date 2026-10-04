import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { caseService } from './api'
import type { CasesData } from './types'
export function useCases() {
  const memberId = useAppStore(s => s.currentMemberId), token = useAppStore(s => s.authToken) ?? ''
  const scope = `${memberId}:${token}`
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{ scope: string; data?: CasesData; error?: string }>({ scope: '' })
  useEffect(() => {
    const controller = new AbortController(); setState(current => current.scope === scope ? { ...current, error: undefined } : { scope })
    if (token && memberId) void caseService.list(memberId, token, controller.signal).then(data => { if (!controller.signal.aborted) setState({ scope, data }) }).catch(e => { if (!controller.signal.aborted) setState({ scope, error: e instanceof Error ? e.message : '情况未能加载' }) })
    return () => controller.abort()
  }, [memberId, token, scope, version])
  return { memberId, token, data: state.scope === scope ? state.data : undefined, error: state.scope === scope ? state.error : undefined, reload: () => setVersion(v => v + 1) }
}
