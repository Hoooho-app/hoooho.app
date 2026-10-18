import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '../../components/design-system'

export function useArchiveEditorExit(dirty: boolean, busy: boolean, close: () => void) {
  const [closing, setClosing] = useState(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  return {
    requestClose: () => { if (!busy) { if (dirty) setClosing(true); else close() } },
    confirmation: <ConfirmDialog open={closing || blocker.state === 'blocked'} title="放弃未保存的填写？" description="本次修改和新添加的原件尚未保存。" cancelLabel="继续填写" confirmLabel="放弃修改" loading={busy} onCancel={() => { setClosing(false); if (blocker.state === 'blocked') blocker.reset() }} onConfirm={() => { setClosing(false); close(); if (blocker.state === 'blocked') blocker.proceed() }}/>
  }
}
