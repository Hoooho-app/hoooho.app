import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle } from 'lucide-react'
import { HohoButton } from '../design-system/HohoButton'
import { ModalSurface } from '../design-system/ModalSurface'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { useVisibleViewport } from '../../hooks/useVisibleViewport'

const EmbeddedLogin = lazy(async () => ({ default: (await import('../../pages/Login')).LoginPage }))

export function SessionExpiredDialog() {
  const [login, setLogin] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const viewport = useVisibleViewport()
  usePageScrollLock(true)
  useDialogFocus(true, dialogRef)
  useEffect(() => {
    // Include existing body portals (record sheets, photo previews), not only the
    // route DOM. The login form is the only interactive surface until verified.
    const inerted = new Set<HTMLElement>()
    const protect = () => {
      for (const child of Array.from(document.body.children)) {
        if (!(child instanceof HTMLElement) || child === layerRef.current || child.hasAttribute('inert')) continue
        child.setAttribute('inert', '')
        inerted.add(child)
      }
    }
    protect()
    const observer = new MutationObserver(protect)
    observer.observe(document.body, { childList: true })
    return () => { observer.disconnect(); inerted.forEach(element => element.removeAttribute('inert')) }
  }, [])
  return createPortal(<div className="session-recovery-expiry-layer" ref={layerRef} style={{ top: viewport.top, height: viewport.height, bottom: 'auto' }}>
    <ModalSurface className="session-recovery-expiry-modal" label="重新登录后继续" ref={dialogRef} tabIndex={-1}>
      {login ? <Suspense fallback={<p className="hoho-text-body flex items-center gap-2" role="status"><LoaderCircle className="session-recovery-spinner" size={18}/>正在打开登录…</p>}><EmbeddedLogin embedded /></Suspense> : <>
        <h2 className="hoho-text-section-title">请重新登录</h2>
        <p className="hoho-text-body mt-2 text-text-secondary">登录后继续刚才的操作。</p>
        <HohoButton className="mt-5" fullWidth onClick={() => setLogin(true)}>重新登录</HohoButton>
      </>}
    </ModalSurface>
  </div>, document.body)
}
