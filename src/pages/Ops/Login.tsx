import { FormEvent, useEffect, useRef, useState } from 'react'
import { Mail, ShieldCheck } from 'lucide-react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import logoUrl from '../../assets/logo.svg'
import { HohoButton } from '../../components/design-system/HohoButton'
import { authService, AuthApiError } from '../../services/auth'
import { useAppStore } from '../../store/useAppStore'
import './ops-login.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_PATTERN = /^\d{6}$/
const GENERIC_SEND_NOTICE = '如果该邮箱具有运营权限，验证码将发送至对应邮箱。'

export function OpsLoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const existingToken = useAppStore((state) => state.opsAuthToken)
  const setSession = useAppStore((state) => state.setOpsAuthSession)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(searchParams.get('reason') === 'expired' ? '运营登录已过期，请重新验证。' : '')
  const [sending, setSending] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const normalizedEmail = email.trim().toLowerCase()
  const emailValid = normalizedEmail.length <= 254 && EMAIL_PATTERN.test(normalizedEmail)
  const codeValid = CODE_PATTERN.test(code)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  if (existingToken) return <Navigate replace to="/ops" />

  const requestCode = async () => {
    if (!emailValid) return setError('请输入正确的邮箱地址')
    setError(''); setNotice(''); setSending(true)
    try {
      const result = await authService.sendOpsEmailCode(normalizedEmail)
      setCountdown(result.retryAfter)
      setNotice(GENERIC_SEND_NOTICE)
      codeRef.current?.focus()
    } catch (cause) {
      const authError = cause instanceof AuthApiError ? cause : null
      setError(authError?.code === 'OPS_OWNER_NOT_CONFIGURED' ? '运营后台暂时不可用' : authError?.message ?? '验证码请求失败，请稍后重试')
      if (authError?.retryAfter) setCountdown(authError.retryAfter)
    } finally { setSending(false) }
  }

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!emailValid) return setError('请输入正确的邮箱地址')
    if (!codeValid) return setError('请输入 6 位数字验证码')
    setError(''); setNotice(''); setLoggingIn(true)
    try {
      const session = await authService.loginOpsWithEmail(normalizedEmail, code)
      setSession(session)
      navigate('/ops', { replace: true })
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '登录失败，请稍后重试')
    } finally { setLoggingIn(false) }
  }

  return <main className="ops-login-page"><section className="ops-login-panel" aria-labelledby="ops-login-title">
    <header><img src={logoUrl} alt="Hoooho"/><div className="ops-login-trace" aria-hidden="true"><i/><i/><i/></div><h1 id="ops-login-title">Hoooho Operations</h1><p>运营与反馈管理后台</p></header>
    <form noValidate onSubmit={login}>
      <label><span>邮箱</span><div className="ops-login-input"><Mail aria-hidden="true" size={18}/><input type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="请输入邮箱地址" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); setNotice('') }}/></div></label>
      <label><span>邮箱验证码</span><div className="ops-login-input"><ShieldCheck aria-hidden="true" size={18}/><input ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6 位验证码" value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '')); setError('') }}/><button type="button" disabled={!emailValid || countdown > 0 || sending} onClick={requestCode}>{sending ? '发送中…' : countdown > 0 ? `${countdown}s` : '获取验证码'}</button></div></label>
      <div className="ops-login-message" aria-live="polite">{error ? <p role="alert" data-tone="error">{error}</p> : notice ? <p>{notice}</p> : null}</div>
      <HohoButton fullWidth loading={loggingIn} size="large" type="submit" disabled={!emailValid || !codeValid}>登录 Operations</HohoButton>
    </form>
  </section></main>
}
