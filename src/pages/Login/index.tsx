import { Mail, ShieldCheck, Smartphone } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import logoUrl from '../../assets/logo.svg'
import { HohoButton } from '../../components/design-system/HohoButton'
import { authService, AuthApiError } from '../../services/auth'
import { useAppStore } from '../../store/useAppStore'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_PATTERN = /^\d{6}$/
const SHOW_PHONE_LOGIN = false

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [showDeliveryHelp, setShowDeliveryHelp] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const deliveryHelpTimerRef = useRef<number | null>(null)
  const setAuthSession = useAppStore((state) => state.setAuthSession)
  const normalizedEmail = email.trim().toLowerCase()
  const emailIsValid = normalizedEmail.length <= 254 && EMAIL_PATTERN.test(normalizedEmail)
  const codeIsValid = CODE_PATTERN.test(code)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => {
      setCountdown((remaining) => Math.max(remaining - 1, 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  useEffect(() => () => {
    if (deliveryHelpTimerRef.current !== null) window.clearTimeout(deliveryHelpTimerRef.current)
  }, [])

  const requestCode = async () => {
    if (!emailIsValid) {
      setError('请输入正确的邮箱地址')
      return
    }
    setError('')
    setNotice('')
    setIsSending(true)
    try {
      const result = await authService.sendEmailCode(normalizedEmail)
      setCountdown(result.retryAfter)
      setNotice('验证码已发送，请查看邮箱')
      setShowDeliveryHelp(false)
      codeInputRef.current?.focus()
      if (deliveryHelpTimerRef.current !== null) window.clearTimeout(deliveryHelpTimerRef.current)
      deliveryHelpTimerRef.current = window.setTimeout(() => setShowDeliveryHelp(true), 18_000)
    } catch (requestError) {
      const authError = requestError instanceof AuthApiError ? requestError : null
      setError(authError?.message ?? '验证码发送失败，请稍后重试')
      if (authError?.retryAfter) setCountdown(authError.retryAfter)
    } finally {
      setIsSending(false)
    }
  }

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!emailIsValid) {
      setError('请输入正确的邮箱地址')
      return
    }
    if (!codeIsValid) {
      setError('请输入 6 位数字验证码')
      return
    }
    setError('')
    setNotice('')
    setIsLoggingIn(true)
    try {
      const session = await authService.loginWithEmail(normalizedEmail, code)
      setAuthSession(session)
      const requestedPath = typeof location.state?.from === 'string' ? location.state.from : ''
      const safePath = requestedPath.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/health-events'
      navigate(safePath, { replace: true })
    } catch (requestError) {
      setError(requestError instanceof AuthApiError ? requestError.message : '登录失败，请稍后重试')
    } finally {
      setIsLoggingIn(false)
    }
  }

  return (
    <main className="app-shell auth-shell relative flex flex-col pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(32px,env(safe-area-inset-top))]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 left-1/2 z-0 w-full max-w-[var(--hoho-app-shell-max)] -translate-x-1/2 overflow-hidden bg-page-background">
        <img
          alt=""
          className="h-full w-full object-cover"
          src="/media/login-family-care-poster.webp"
        />
        <video
          autoPlay
          className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
          loop
          muted
          playsInline
          poster="/media/login-family-care-poster.webp"
          preload="metadata"
          tabIndex={-1}
        >
          <source src="/media/login-family-care.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-surface/50 via-background/60 to-background/80" />
      </div>

      <div className="auth-panel relative z-10 flex flex-1 flex-col">
        <header className="flex flex-col items-center pt-6 text-center">
          <img className="h-[46px] w-40 object-contain" src={logoUrl} alt="Hoooho" />
          <h1 className="hoho-text-page-title mt-7">欢迎使用 Hoooho</h1>
          <p className="hoho-text-body mt-2">家庭健康随记与就诊准备工具</p>
        </header>

        <form className="mt-10 space-y-3" noValidate onSubmit={login}>
          <label className="flex min-h-12 items-center gap-3 rounded-control border bg-surface px-4 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            <Mail aria-hidden="true" className="shrink-0 text-primary" size={18} strokeWidth={1.8} />
            <span className="sr-only">邮箱地址</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-secondary/60"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              placeholder="请输入邮箱地址"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError('')
                setNotice('')
              }}
              onBlur={() => email && !emailIsValid && setError('请输入正确的邮箱地址')}
            />
          </label>

          <label className="flex min-h-12 items-center gap-3 rounded-control border bg-surface px-4 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            <ShieldCheck aria-hidden="true" className="shrink-0 text-primary" size={18} strokeWidth={1.8} />
            <span className="sr-only">验证码</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-secondary/60"
              inputMode="numeric"
              autoComplete="one-time-code"
              ref={codeInputRef}
              maxLength={6}
              placeholder="请输入验证码"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, ''))
                setError('')
              }}
            />
            <button
              className="min-h-11 shrink-0 px-1 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:text-text-secondary/60"
              type="button"
              disabled={!emailIsValid || countdown > 0 || isSending}
              onClick={requestCode}
            >
              {isSending ? '发送中…' : countdown > 0 ? `重新获取 (${countdown}s)` : '获取验证码'}
            </button>
          </label>

          <div className="min-h-5 px-1" aria-live="polite">
            {error && <p className="text-xs text-danger">{error}</p>}
            {!error && notice && <p className="text-xs text-primary">{notice}</p>}
            {!error && showDeliveryHelp && <p className="mt-1 text-xs text-text-secondary">还没收到？请检查垃圾邮件，倒计时结束后可以重新获取。</p>}
          </div>

          <HohoButton fullWidth loading={isLoggingIn} size="large" type="submit" disabled={!emailIsValid || !codeIsValid}>登录</HohoButton>
        </form>

        {SHOW_PHONE_LOGIN && (
          <HohoButton
            className="mt-3"
            fullWidth
            variant="secondary"
            onClick={() => {
              setError('')
              setNotice('该功能暂未开放')
            }}
          >
            <Smartphone aria-hidden="true" size={17} strokeWidth={1.8} />
            手机号登录
          </HohoButton>
        )}

        <p className="mt-4 text-center text-[11px] leading-5 text-text-secondary">
          登录即表示同意
          <span className="mx-1">《用户协议》</span>
          和
          <span className="ml-1">《隐私政策》</span>
        </p>

      </div>

    </main>
  )
}
