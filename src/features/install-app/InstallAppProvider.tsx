import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'

type InstallPromptOutcome = 'accepted' | 'dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: InstallPromptOutcome; platform: string }>
}

interface InstallAppContextValue {
  activate: () => Promise<void>
  busy: boolean
  visible: boolean
}

const InstallAppContext = createContext<InstallAppContextValue | null>(null)
const installedMarker = 'hoooho-install-app-confirmed'
const standaloneQueries = ['(display-mode: standalone)', '(display-mode: fullscreen)'] as const

function readInstalledMarker() {
  try { return window.localStorage.getItem(installedMarker) === 'true' } catch { return false }
}

function writeInstalledMarker() {
  try { window.localStorage.setItem(installedMarker, 'true') } catch { /* Standalone detection still hides the entry. */ }
}

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return Boolean(navigatorWithStandalone.standalone) || standaloneQueries.some((query) => window.matchMedia(query).matches)
}

function isIosSafari() {
  const userAgent = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const competingBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|MicroMessenger|QQBrowser|UCBrowser/i.test(userAgent)
  return iOS && /Safari/i.test(userAgent) && !competingBrowser
}

function InstallGuide({ onClose, onConfirmInstalled }: { onClose: () => void; onConfirmInstalled: () => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const [imageFailed, setImageFailed] = useState(false)
  usePageScrollLock(true)
  useDialogFocus(true, dialogRef)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="install-guide-layer" role="presentation">
      <section aria-label="添加到主屏幕" aria-modal="true" className="install-guide" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className="install-guide__header">
          <h2>添加到主屏幕</h2>
          <button aria-label="关闭添加到主屏幕图示" className="install-guide__close" onClick={onClose} type="button">
            <X aria-hidden="true" size={21} strokeWidth={1.8} />
          </button>
        </header>
        {imageFailed ? (
          <div className="install-guide__failure" role="status">图示暂时无法加载</div>
        ) : (
          <div className="install-guide__steps">
            <figure className="install-guide__step">
              <span aria-hidden="true" className="install-guide__number">1</span>
              <div className="install-guide__image-window install-guide__image-window--share">
                <img alt="Safari 菜单中的分享入口" decoding="async" onError={() => setImageFailed(true)} src="/tutorials/add-to-home-screen/safari-share.jpg" />
                <span aria-hidden="true" className="install-guide__highlight install-guide__highlight--share" />
              </div>
            </figure>
            <figure className="install-guide__step">
              <span aria-hidden="true" className="install-guide__number">2</span>
              <div className="install-guide__image-window install-guide__image-window--add">
                <img alt="Safari 分享菜单中的添加到主屏幕入口" decoding="async" onError={() => setImageFailed(true)} src="/tutorials/add-to-home-screen/safari-add.jpg" />
                <span aria-hidden="true" className="install-guide__highlight install-guide__highlight--add" />
              </div>
            </figure>
          </div>
        )}
        <button className="install-guide__confirmed" onClick={onConfirmInstalled} type="button">
          我已添加，不再显示
        </button>
      </section>
    </div>
  )
}

export function InstallAppProvider({ children }: { children: ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [installed, setInstalled] = useState(() => isStandalone() || readInstalledMarker())
  const [busy, setBusy] = useState(false)
  const [unsupportedNotice, setUnsupportedNotice] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const onAppInstalled = () => {
      writeInstalledMarker()
      setInstalled(true)
      setGuideOpen(false)
      setPromptEvent(null)
    }
    const syncInstalledState = () => {
      if (isStandalone()) {
        writeInstalledMarker()
        setInstalled(true)
        return
      }
      if (readInstalledMarker()) setInstalled(true)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') syncInstalledState()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === installedMarker && event.newValue === 'true') setInstalled(true)
    }
    const mediaQueries = standaloneQueries.map((query) => window.matchMedia(query))
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    window.addEventListener('focus', syncInstalledState)
    window.addEventListener('pageshow', syncInstalledState)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibilityChange)
    mediaQueries.forEach((query) => {
      if (typeof query.addEventListener === 'function') query.addEventListener('change', syncInstalledState)
      else query.addListener(syncInstalledState)
    })
    syncInstalledState()
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      window.removeEventListener('focus', syncInstalledState)
      window.removeEventListener('pageshow', syncInstalledState)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      mediaQueries.forEach((query) => {
        if (typeof query.removeEventListener === 'function') query.removeEventListener('change', syncInstalledState)
        else query.removeListener(syncInstalledState)
      })
    }
  }, [])

  useEffect(() => {
    if (!unsupportedNotice) return
    const timer = window.setTimeout(() => setUnsupportedNotice(false), 2400)
    return () => window.clearTimeout(timer)
  }, [unsupportedNotice])

  const activate = useCallback(async () => {
    if (busy || installed || guideOpen) return
    if (promptEvent) {
      setBusy(true)
      setPromptEvent(null)
      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        if (choice.outcome === 'accepted') setInstalled(true)
      } finally {
        setBusy(false)
      }
      return
    }
    if (isIosSafari()) {
      setGuideOpen(true)
      return
    }
    setUnsupportedNotice(true)
  }, [busy, guideOpen, installed, promptEvent])

  const value = useMemo(() => ({ activate, busy, visible: !installed }), [activate, busy, installed])

  const confirmInstalled = useCallback(() => {
    writeInstalledMarker()
    setInstalled(true)
    setGuideOpen(false)
  }, [])

  return (
    <InstallAppContext.Provider value={value}>
      {children}
      {guideOpen && <InstallGuide onClose={() => setGuideOpen(false)} onConfirmInstalled={confirmInstalled} />}
      {unsupportedNotice && <div aria-live="polite" className="install-app-notice" role="status">当前浏览器暂不支持直接添加</div>}
    </InstallAppContext.Provider>
  )
}

export function useInstallApp() {
  const context = useContext(InstallAppContext)
  if (!context) throw new Error('useInstallApp must be used inside InstallAppProvider')
  return context
}
