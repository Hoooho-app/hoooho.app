import { Check, Copy, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import logoUrl from '../../assets/logo.svg'
import { HohoButton } from '../../components/design-system/HohoButton'
import { authService, AuthApiError } from '../../services/auth'
import { useAppStore } from '../../store/useAppStore'
import { restoreBrowserSession } from '../../components/auth/SessionBootstrap'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_PATTERN = /^\d{6}$/
const recentIdKey = 'hoooho-recent-account-id'
const requestKey = () => globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}`

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const authUser = useAppStore((state) => state.authUser)
  const setAuthSession = useAppStore((state) => state.setAuthSession)
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [nickname, setNickname] = useState('')
  const [hooohoId, setHooohoId] = useState(() => { try { return localStorage.getItem(recentIdKey) ?? '' } catch { return '' } })
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createdId, setCreatedId] = useState('')
  const registrationKey = useRef(requestKey())
  const codeInputRef = useRef<HTMLInputElement>(null)
  const emailIsValid = email.trim().length <= 254 && EMAIL_PATTERN.test(email.trim())

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const destination = () => {
    const requested = typeof location.state?.from === 'string' ? location.state.from : ''
    return requested.startsWith('/') && !requested.startsWith('//') ? requested : '/nurse-station'
  }

  const rememberId = (id?: string) => {
    if (!id) return
    try { localStorage.setItem(recentIdKey, id) } catch { /* Optional convenience only. */ }
  }

  const submitPrimary = async (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'register' && (!nickname.trim() || password.length < 6 || password.length > 64)) { setError(!nickname.trim() ? '请填写昵称' : '密码需为 6–64 个字符'); return }
    if (mode === 'login' && (!hooohoId.trim() || !password)) { setError('请输入 Hoooho ID 和密码'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const session = mode === 'register' ? await authService.register(nickname.trim(), password, registrationKey.current) : await authService.loginWithPassword(hooohoId.trim(), password)
      setAuthSession(session); await restoreBrowserSession(); rememberId(session.user.hooohoId); setPassword('')
      if (mode === 'register') setCreatedId(session.user.hooohoId ?? '')
      else navigate(destination(), { replace: true })
    } catch (cause) { setError(cause instanceof AuthApiError ? cause.message : mode === 'register' ? '注册失败，请稍后重试' : 'Hoooho ID 或密码错误') }
    finally { setBusy(false) }
  }

  const requestEmailCode = async () => {
    if (!emailIsValid) { setError('请输入正确的邮箱地址'); return }
    setBusy(true); setError(''); setNotice('')
    try { const result = await authService.sendEmailCode(email.trim()); setCountdown(result.retryAfter); setNotice('验证码已发送，请查看邮箱'); codeInputRef.current?.focus() }
    catch (cause) { setError(cause instanceof AuthApiError ? cause.message : '验证码发送失败，请稍后重试') }
    finally { setBusy(false) }
  }

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault()
    if (!emailIsValid || !CODE_PATTERN.test(code)) { setError(!emailIsValid ? '请输入正确的邮箱地址' : '请输入 6 位数字验证码'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const session = await authService.loginWithEmail(email.trim(), code, authUser?.guest ? useAppStore.getState().authToken ?? '' : '')
      setAuthSession(session); await restoreBrowserSession(); rememberId(session.user.hooohoId); navigate(destination(), { replace: true })
    } catch (cause) { setError(cause instanceof AuthApiError ? cause.message : '登录失败，请稍后重试') }
    finally { setBusy(false) }
  }

  const fieldClass = 'flex min-h-12 items-center gap-3 rounded-control border bg-surface px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15'
  return (
    <main className="app-shell auth-shell relative flex flex-col pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))]">
      <div className="auth-panel relative z-10 flex flex-1 flex-col">
        <header className="flex flex-col items-center pt-2 text-center"><img className="h-[42px] w-36 object-contain" src={logoUrl} alt="Hoooho" /><h1 className="hoho-text-page-title mt-5">欢迎使用 Hoooho</h1><p className="hoho-text-body mt-1.5">家庭健康随记与就诊准备工具</p></header>
        <div className="mt-5 grid grid-cols-2 rounded-control border bg-surface p-1" role="tablist" aria-label="登录或注册">
          {(['register', 'login'] as const).map((value) => <button aria-selected={mode === value} className={`min-h-10 rounded-[12px] text-sm font-semibold transition ${mode === value ? 'bg-primary/15 text-primary' : 'text-text-secondary'}`} key={value} onClick={() => { setMode(value); setError(''); setPassword('') }} role="tab" type="button">{value === 'register' ? '注册' : '登录'}</button>)}
        </div>
        <form className="mt-4 space-y-3" onSubmit={submitPrimary}>
          <label className={fieldClass}><UserRound className="shrink-0 text-primary" size={19} aria-hidden="true" /><input className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-secondary/60" autoCapitalize="off" autoComplete={mode === 'register' ? 'nickname' : 'username'} maxLength={mode === 'register' ? 20 : 8} placeholder={mode === 'register' ? '给自己起个昵称' : '请输入 Hoooho ID'} value={mode === 'register' ? nickname : hooohoId} onChange={(event) => { mode === 'register' ? setNickname(event.target.value) : setHooohoId(event.target.value.toUpperCase()); setError('') }} /></label>
          <label className={fieldClass}><LockKeyhole className="shrink-0 text-primary" size={19} aria-hidden="true" /><input className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-secondary/60" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} maxLength={64} placeholder={mode === 'register' ? '设置一个密码' : '请输入密码'} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} /><button className="grid h-11 w-11 place-items-center text-text-secondary" type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></label>
          <div className="min-h-5 px-1" aria-live="polite">{error ? <p className="text-xs text-danger">{error}</p> : notice ? <p className="text-xs text-primary">{notice}</p> : null}</div>
          <HohoButton fullWidth loading={busy && !emailOpen} size="large" type="submit">{mode === 'register' ? (authUser?.guest ? '创建账号以保留记录' : '注册并进入') : '登录'}</HohoButton>
        </form>
        <div className="my-3 flex items-center gap-3 text-xs text-text-secondary"><span className="h-px flex-1 bg-border" /><span>或</span><span className="h-px flex-1 bg-border" /></div>
        <button className="mx-auto flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-primary" type="button" onClick={() => { setEmailOpen((value) => !value); setError(''); setNotice('') }}><Mail size={18} />使用邮箱验证码</button>
        {emailOpen && <form className="mt-3 space-y-3" onSubmit={submitEmail}><label className={fieldClass}><Mail className="text-primary" size={18} /><input className="min-w-0 flex-1 bg-transparent text-base outline-none" type="email" autoComplete="email" placeholder="请输入邮箱地址" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className={fieldClass}><ShieldCheck className="text-primary" size={18} /><input ref={codeInputRef} className="min-w-0 flex-1 bg-transparent text-base outline-none" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="请输入验证码" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /><button className="min-h-11 shrink-0 text-sm font-semibold text-primary disabled:text-text-secondary/60" disabled={!emailIsValid || countdown > 0 || busy} onClick={() => void requestEmailCode()} type="button">{countdown ? `${countdown}s` : '获取验证码'}</button></label><HohoButton fullWidth loading={busy} size="large" type="submit" disabled={!emailIsValid || !CODE_PATTERN.test(code)}>继续</HohoButton></form>}
        <p className="mt-3 text-center text-[11px] leading-5 text-text-secondary">{mode === 'register' ? '注册' : '登录'}即表示同意 <span>《用户协议》</span> 和 <span>《隐私政策》</span></p>
      </div>
      {createdId && <div className="fixed inset-0 z-50 grid place-items-center bg-text-primary/50 px-5" role="dialog" aria-modal="true" aria-label="账号已创建"><section className="w-full max-w-sm rounded-[22px] bg-surface p-5 text-center shadow-xl"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/15 text-primary"><Check size={34} /></span><h2 className="hoho-text-page-title mt-4">账号已创建</h2><p className="mt-3 text-sm text-text-secondary">你的 Hoooho ID</p><strong className="mt-2 block rounded-control bg-primary/10 px-3 py-4 text-2xl tracking-wider text-primary">{createdId}</strong><p className="mt-3 text-xs leading-5 text-text-secondary">已在本机记住，可在“账户与安全”中查看</p><HohoButton className="mt-5" fullWidth size="large" onClick={() => navigate(destination(), { replace: true })}>进入 Hoooho</HohoButton><HohoButton className="mt-2" fullWidth size="large" variant="secondary" onClick={() => void navigator.clipboard.writeText(createdId)}><Copy size={17} />复制 ID</HohoButton></section></div>}
    </main>
  )
}
