import { ShieldCheck, Smartphone } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoUrl from '../../assets/logo.svg'

const PHONE_PATTERN = /^1[3-9]\d{9}$/
const CODE_PATTERN = /^\d{4,6}$/

export function LoginPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => {
      setCountdown((remaining) => Math.max(remaining - 1, 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const requestCode = () => {
    if (!PHONE_PATTERN.test(phone)) {
      setError('请输入正确的中国大陆手机号')
      return
    }
    setError('')
    setCountdown(60)
  }

  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!PHONE_PATTERN.test(phone)) {
      setError('请输入正确的中国大陆手机号')
      return
    }
    if (!CODE_PATTERN.test(code)) {
      setError('请输入 4–6 位数字验证码')
      return
    }
    setError('')
    navigate('/health-events')
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[402px] flex-col overflow-y-auto overscroll-contain bg-background px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(48px,env(safe-area-inset-top))] shadow-card">
      <div className="relative z-10 flex flex-1 flex-col">
        <header className="flex flex-col items-center pt-10 text-center">
          <img className="h-[46px] w-40 object-contain" src={logoUrl} alt="Hoooho" />
          <h1 className="mt-7 text-2xl font-semibold tracking-tight text-text-primary">欢迎使用 Hoooho</h1>
          <p className="mt-2 text-sm text-text-secondary">家庭健康事件管理平台</p>
        </header>

        <form className="mt-12 space-y-3" noValidate onSubmit={login}>
          <label className="flex min-h-12 items-center gap-3 rounded-control border bg-surface px-4 shadow-card transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            <Smartphone aria-hidden="true" className="shrink-0 text-primary" size={18} strokeWidth={1.8} />
            <span className="sr-only">手机号</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-secondary/60"
              inputMode="tel"
              autoComplete="tel"
              maxLength={11}
              placeholder="请输入手机号"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value.replace(/\D/g, ''))
                setError('')
              }}
            />
          </label>

          <label className="flex min-h-12 items-center gap-3 rounded-control border bg-surface px-4 shadow-card transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            <ShieldCheck aria-hidden="true" className="shrink-0 text-primary" size={18} strokeWidth={1.8} />
            <span className="sr-only">验证码</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-secondary/60"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="请输入验证码"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, ''))
                setError('')
              }}
            />
            <button
              className="shrink-0 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:text-text-secondary/60"
              type="button"
              disabled={countdown > 0}
              onClick={requestCode}
            >
              {countdown > 0 ? `重新获取 (${countdown}s)` : '获取验证码'}
            </button>
          </label>

          <div className="min-h-5 px-1" aria-live="polite">
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <button className="min-h-12 w-full rounded-pill bg-primary text-sm font-semibold text-surface shadow-floating transition active:scale-[0.98] disabled:opacity-50" type="submit">
            登录
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-5 text-text-secondary">
          登录即表示同意
          <button className="mx-1 text-primary" type="button">《用户协议》</button>
          和
          <button className="ml-1 text-primary" type="button">《隐私政策》</button>
        </p>

        <div className="mt-9 flex items-center gap-4 text-xs text-text-secondary/80">
          <span className="h-px flex-1 bg-border" />
          <span>陪伴家人每一次健康时刻</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none relative -mx-6 -mb-[max(28px,env(safe-area-inset-bottom))] mt-8 h-28 overflow-hidden bg-primary-soft">
        <div className="absolute -left-12 top-7 h-24 w-60 rotate-3 rounded-[50%] bg-primary/12" />
        <div className="absolute -right-14 top-3 h-24 w-64 -rotate-3 rounded-[50%] bg-primary/15" />
        <div className="absolute bottom-0 left-0 h-12 w-full bg-primary/20" />
        <div className="absolute bottom-9 left-1/2 h-9 w-12 -translate-x-1/2 bg-surface/85 [clip-path:polygon(50%_0,100%_40%,100%_100%,0_100%,0_40%)]" />
        <div className="absolute bottom-9 left-[calc(50%+3px)] h-5 w-1.5 bg-primary/35" />
        <div className="absolute bottom-8 left-10 h-12 w-4 rounded-full bg-primary/35" />
        <div className="absolute bottom-8 right-10 h-11 w-4 rounded-full bg-primary/30" />
      </div>
    </main>
  )
}
