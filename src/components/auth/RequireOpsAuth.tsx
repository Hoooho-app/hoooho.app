import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { AlertTriangle, LoaderCircle, LogOut } from 'lucide-react'
import { HohoButton } from '../design-system/HohoButton'
import { getOpsSession, toOpsAuthSession } from '../../services/opsAuth'
import { useAppStore } from '../../store/useAppStore'
import './ops-auth.css'

export function RequireOpsAuth() {
  const token = useAppStore((state) => state.opsAuthToken)
  const failure = useAppStore((state) => state.opsAuthFailure)
  const setSession = useAppStore((state) => state.setOpsAuthSession)
  const clearSession = useAppStore((state) => state.clearOpsAuthSession)
  const [state, setState] = useState<'checking' | 'authorized' | 'network-error'>('checking')

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setState('checking')
    getOpsSession(token, controller.signal)
      .then((session) => {
        setSession(toOpsAuthSession(token, session))
        setState('authorized')
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        if (useAppStore.getState().opsAuthToken) setState('network-error')
      })
    return () => controller.abort()
  }, [setSession, token])

  if (!token) {
    if (failure === 'forbidden') return <OpsAccessDenied onExit={() => clearSession()} />
    if (failure === 'not-configured') return <OpsUnavailable onExit={() => clearSession()} />
    return <Navigate replace to={failure === 'expired' ? '/ops/login?reason=expired' : '/ops/login'} />
  }
  if (state === 'authorized') return <Outlet />
  if (state === 'network-error') {
    return <main className="ops-auth-state"><AlertTriangle aria-hidden="true"/><h1>无法验证运营登录状态</h1><p>网络连接异常。为保护后台数据，权限确认前不会显示运营内容。</p><HohoButton onClick={() => window.location.reload()}>重新验证</HohoButton></main>
  }
  return <main className="ops-auth-state" aria-live="polite"><LoaderCircle className="ops-auth-spinner" aria-hidden="true"/><h1>正在验证运营权限</h1><p>权限确认完成前不会加载后台数据。</p></main>
}

function OpsAccessDenied({ onExit }: { onExit: () => void }) {
  return <main className="ops-auth-state"><LogOut aria-hidden="true"/><h1>没有运营后台访问权限</h1><p>当前账号不能访问 Hoooho Operations。</p><div className="ops-auth-state__actions"><HohoButton onClick={onExit}>退出并更换账号</HohoButton><a className="hoho-button" data-variant="secondary" href="/">返回 Hoooho</a></div></main>
}

function OpsUnavailable({ onExit }: { onExit: () => void }) {
  return <main className="ops-auth-state"><AlertTriangle aria-hidden="true"/><h1>运营后台暂时不可用</h1><p>唯一管理员配置尚未完成。后台数据不会显示。</p><HohoButton variant="secondary" onClick={onExit}>返回登录页</HohoButton></main>
}
