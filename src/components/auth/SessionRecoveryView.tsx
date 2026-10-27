import { CircleCheck, CloudOff, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import logoUrl from '../../assets/logo.svg'
import { HohoButton } from '../design-system/HohoButton'
import { useBrowserRecoveryState } from '../../services/browserRecoveryState'
import { getProfileSectionSnapshot, subscribeProfileSections } from '../../services/profileSectionStorage'
import { useVisibleViewport } from '../../hooks/useVisibleViewport'
import { recoverBrowserSession } from './SessionBootstrap'
import './session-recovery.css'

export function SessionRecoveryScreen({ failed = false, onRetry, archive = false }: { failed?: boolean; onRetry?: () => void; archive?: boolean }) {
  const stage = useBrowserRecoveryState(state => state.stage)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (failed) return
    const timer = window.setTimeout(() => setSlow(true), 6000)
    return () => window.clearTimeout(timer)
  }, [failed, stage])
  useEffect(() => {
    useBrowserRecoveryState.setState(state => ({ blockingScreens: state.blockingScreens + 1 }))
    return () => useBrowserRecoveryState.setState(state => ({ blockingScreens: Math.max(0, state.blockingScreens - 1) }))
  }, [])
  const description = failed ? '请检查网络后重试，我们会回到你要打开的页面。' : archive ? '正在载入你的档案…' : stage === 'members' ? '正在载入孩子信息…' : '正在连接你的账号…'
  return <main className="app-shell session-recovery-screen" data-session-recovery-screen aria-busy={!failed}>
    <div className="session-recovery-screen__body">
      <div aria-hidden="true" className="session-recovery-art"><span className="session-recovery-art__orbit"/><img className="session-recovery-art__logo" alt="" src={logoUrl}/></div>
      <div className="session-recovery-brand"><span>Hoooho</span><span>护护记录</span></div>
      <div className="session-recovery-copy" aria-live="polite" role={failed ? 'alert' : 'status'}>
        <h1 className="hoho-text-section-title">{failed ? archive ? '部分资料暂时未加载' : '暂时没能连接上' : archive ? '正在打开资料' : '正在打开 Hoooho'}</h1>
        <p className="hoho-text-caption">{description}</p>
      </div>
      {failed ? <HohoButton onClick={onRetry}>重新连接</HohoButton> : <div aria-hidden="true" className="session-recovery-progress"><span/></div>}
      <p className="session-recovery-hint">{!failed && slow ? '连接比平时慢一些，请稍候' : '\u00a0'}</p>
    </div>
    <footer className="session-recovery-screen__footer">记录<span>·</span>整理<span>·</span>交接</footer>
  </main>
}

// Prevent an initial empty archive from being rendered as an actual health fact.
// Once loaded, keep the subtree mounted throughout all subsequent refreshes.
export function ProfileSectionGate({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeProfileSections, getProfileSectionSnapshot)
  if (snapshot.loaded) return children
  return <SessionRecoveryScreen archive failed={snapshot.failed} onRetry={() => void recoverBrowserSession()} />
}

export function SessionRecoveryNotice() {
  const { phase, stage, contextAccountId, reauthenticationRequired, blockingScreens } = useBrowserRecoveryState()
  const [visible, setVisible] = useState(false)
  const shown = useRef(false)
  const viewport = useVisibleViewport()
  useEffect(() => {
    let timer: number | undefined
    if (phase === 'recovering') {
      timer = window.setTimeout(() => { shown.current = true; setVisible(true) }, 1000)
    } else if (phase === 'failed') {
      shown.current = true
      setVisible(true)
    } else if (phase === 'restored' && shown.current) {
      setVisible(true)
      timer = window.setTimeout(() => { shown.current = false; setVisible(false) }, 1600)
    } else {
      shown.current = false
      setVisible(false)
    }
    return () => window.clearTimeout(timer)
  }, [phase])
  if (!visible || !contextAccountId || reauthenticationRequired || blockingScreens > 0) return null
  if (phase === 'recovering' || phase === 'restored') return <div className="session-recovery-chip-position"><div className="session-recovery-chip" role="status" aria-live="polite">
    {phase === 'recovering' ? <LoaderCircle aria-hidden="true" className="session-recovery-spinner" size={15}/> : <CircleCheck aria-hidden="true" size={15}/>}
    <span>{phase === 'restored' ? '已重新连接' : stage === 'session' ? '正在连接…' : '正在更新资料…'}</span>
  </div></div>
  const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.top)
  return <div className="session-recovery-notice-position" style={{ bottom: `calc(${keyboardInset + (viewport.keyboard ? 68 : 92)}px + env(safe-area-inset-bottom))` }}>
    <section className="session-recovery-notice" aria-live="polite" role="status">
      <CloudOff aria-hidden="true" className="shrink-0 text-text-secondary" size={20} strokeWidth={1.6}/>
      <div className="min-w-0 flex-1"><p className="hoho-text-body">{stage === 'session' ? '连接暂时中断' : '部分资料暂未更新'}</p><p className="hoho-text-caption">当前显示上次加载的内容</p></div>
      <HohoButton size="small" variant="secondary" onClick={() => void recoverBrowserSession()}>重试</HohoButton>
    </section>
  </div>
}
