import { CompleteImage } from '../../components/common/CompleteImage'
import { Apple, ChevronLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Smartphone, UserRound } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import logoUrl from '../../assets/logo.svg'
import { HohoButton } from '../../components/design-system/HohoButton'
import { authService, AuthApiError } from '../../services/auth'
import { useAppStore } from '../../store/useAppStore'
import { restoreBrowserSession } from '../../components/auth/SessionBootstrap'
import { Onboarding } from '../../features/welcome/Onboarding'
import { completeWelcome, hasSeenWelcome } from '../../features/welcome/welcomeState'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_PATTERN = /^\d{6}$/
const PHONE_PATTERN = /^1[3-9]\d{9}$/
type LoginMethod = 'account' | 'email' | 'phone-code' | 'phone-password' | 'apple'
const recentNicknameKey = 'lastLoginNickname'
const rememberLoginPreferenceKey = 'rememberLoginPreference'
const requestKey = () => globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}`

export function LoginPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate(), location = useLocation()
  const authUser = useAppStore((state) => state.authUser), setAuthSession = useAppStore((state) => state.setAuthSession)
  const token = useAppStore((state) => state.authToken)
  const [showWelcome, setShowWelcome] = useState(() => !hasSeenWelcome())
  const [mode, setMode] = useState<'register' | 'login'>('login')
  const [nickname, setNickname] = useState(() => { try { return localStorage.getItem(recentNicknameKey) ?? '' } catch { return '' } })
  const [rememberLogin, setRememberLogin] = useState(() => { try { return localStorage.getItem(rememberLoginPreferenceKey) !== 'false' } catch { return true } })
  const [password, setPassword] = useState(''), [showPassword, setShowPassword] = useState(false), [method, setMethod] = useState<LoginMethod>('account')
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [countdown, setCountdown] = useState(0)
  const [phone, setPhone] = useState(''), [phoneCode, setPhoneCode] = useState(''), [phoneCountdown, setPhoneCountdown] = useState(0)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const registrationKey = useRef(requestKey()), codeInputRef = useRef<HTMLInputElement>(null), phoneCodeInputRef = useRef<HTMLInputElement>(null), methodHeadingRef = useRef<HTMLHeadingElement>(null)
  const phoneIsValid = PHONE_PATTERN.test(phone)
  const emailIsValid = email.trim().length <= 254 && EMAIL_PATTERN.test(email.trim())
  useEffect(() => { if (countdown <= 0) return; const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [countdown])
  useEffect(() => { if (phoneCountdown <= 0) return; const timer = window.setInterval(() => setPhoneCountdown((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [phoneCountdown])
  useEffect(() => { if (method !== 'account') methodHeadingRef.current?.focus() }, [method])
  const selectMethod = (next: LoginMethod) => { if (busy) return; setMethod(next); setError(''); setNotice(''); setCode(''); setPhoneCode(''); setPassword(''); setShowPassword(false) }
  const destination = () => { const requested = typeof location.state?.from === 'string' ? location.state.from : ''; return requested.startsWith('/') && !requested.startsWith('//') ? requested : '/nurse-station' }
  useEffect(() => {
    if (!embedded && token && authUser && !authUser.guest) navigate(authUser.requiresNicknameSetup ? '/account/nickname' : destination(), { replace: true })
  }, [authUser, embedded, navigate, token])
  const rememberNickname = (value?: string) => { try { if (value) localStorage.setItem(recentNicknameKey, value); else localStorage.removeItem(recentNicknameKey) } catch { /* Optional convenience only. */ } }
  const setRememberPreference = (value: boolean) => { try { localStorage.setItem(rememberLoginPreferenceKey, String(value)) } catch { /* The control still works for the current page. */ } }
  const finish = async (session: Awaited<ReturnType<typeof authService.register>>, shouldRememberNickname = true) => { rememberNickname(shouldRememberNickname ? session.user.nickname : undefined); setRememberPreference(shouldRememberNickname); setAuthSession(session); await restoreBrowserSession(); setPassword(''); if (!embedded || session.user.requiresNicknameSetup) navigate(session.user.requiresNicknameSetup ? '/account/nickname' : destination(), { replace: true }) }
  const submitPrimary = async (event: FormEvent) => { event.preventDefault(); if (!nickname.trim() || !password) { setError(mode === 'register' ? (!nickname.trim() ? '请填写昵称' : '密码需为 6–64 个字符') : '请输入昵称和密码'); return } if (password.length < 6 || password.length > 64) { setError(mode === 'register' ? '密码需为 6–64 个字符' : '昵称或密码不正确'); return } setBusy(true); setError(''); setNotice(''); try { await finish(mode === 'register' ? await authService.register(nickname, password, registrationKey.current) : await authService.loginWithPassword(nickname, password, rememberLogin), mode === 'register' || rememberLogin) } catch (cause) { setError(cause instanceof AuthApiError ? cause.message : mode === 'register' ? '注册失败，请稍后重试' : '昵称或密码不正确') } finally { setBusy(false) } }
  const requestEmailCode = async () => { if (!emailIsValid) { setError('请输入正确的邮箱地址'); return } setBusy(true); setError(''); setNotice(''); try { const result = await authService.sendEmailCode(email.trim()); setCountdown(result.retryAfter); setNotice('验证码已发送，请查看邮箱'); codeInputRef.current?.focus() } catch (cause) { setError(cause instanceof AuthApiError ? cause.message : '验证码发送失败，请稍后重试') } finally { setBusy(false) } }
  const submitEmail = async (event: FormEvent) => { event.preventDefault(); if (!emailIsValid || !CODE_PATTERN.test(code)) { setError(!emailIsValid ? '请输入正确的邮箱地址' : '请输入 6 位数字验证码'); return } setBusy(true); setError(''); setNotice(''); try { await finish(await authService.loginWithEmail(email.trim(), code, authUser?.guest ? useAppStore.getState().authToken ?? '' : '')) } catch (cause) { setError(cause instanceof AuthApiError ? cause.message : '登录失败，请稍后重试') } finally { setBusy(false) } }
  const requestPhoneCode = async () => {
    if (!phoneIsValid || busy || phoneCountdown > 0) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await authService.sendCode(phone)
      setPhoneCountdown(result.retryAfter)
      setNotice('验证码已发送，请查看短信')
      phoneCodeInputRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof AuthApiError
        ? cause.code === 'SMS_PROVIDER_NOT_CONFIGURED' ? '短信登录正在接入，请先使用邮箱或账号密码登录' : cause.message
        : '验证码发送失败，请稍后重试')
    } finally { setBusy(false) }
  }
  const submitPhone = async (event: FormEvent) => {
    event.preventDefault()
    if (!phoneIsValid || !CODE_PATTERN.test(phoneCode) || busy) return
    setBusy(true); setError(''); setNotice('')
    try { await finish(await authService.login(phone, phoneCode, authUser?.guest ? useAppStore.getState().authToken ?? '' : '')) }
    catch (cause) { setError(cause instanceof AuthApiError ? cause.message : '登录失败，请稍后重试') }
    finally { setBusy(false) }
  }
  const fieldClass = 'flex min-h-12 items-center gap-3 rounded-control border bg-surface px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15'
  const secondaryMethods = [
    { method: 'apple', label: 'Apple 登录', caption: 'Apple', icon: <Apple size={22} fill="currentColor" /> },
    { method: 'phone-code', label: '手机号验证码登录', caption: '手机验证码', icon: <Smartphone size={22} /> },
    { method: 'phone-password', label: '手机号密码登录', caption: '手机密码', icon: <LockKeyhole size={22} /> },
    { method: 'email', label: '邮箱验证码登录', caption: '邮箱', icon: <Mail size={22} /> }
  ] as const
  if (!embedded && !authUser && showWelcome) return <Onboarding onComplete={() => { completeWelcome(); setShowWelcome(false) }} />
  return <main className={embedded ? 'session-recovery-login' : 'app-shell auth-shell relative flex flex-col pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))]'}><div className="auth-panel relative z-10 flex flex-1 flex-col">
    <header className="flex flex-col items-center pt-2 text-center"><CompleteImage className="h-16 w-16 rounded-card object-contain" src={logoUrl} alt="Hoooho" /><h1 className="hoho-text-page-title mt-5">欢迎使用 Hoooho</h1></header>
    {method !== 'account' ? <><button className="mt-4 flex min-h-10 items-center self-start text-sm text-text-secondary" type="button" disabled={busy} onClick={() => selectMethod('account')}><ChevronLeft size={18} />返回账号登录</button><h2 ref={methodHeadingRef} tabIndex={-1} className="hoho-text-section-title mt-2" id="login-method-heading">{method === 'email' ? '使用邮箱验证码' : method === 'phone-code' ? '使用手机验证码' : method === 'phone-password' ? '使用手机号密码' : '使用 Apple 登录'}</h2>{method === 'email' ? <><form className="mt-4 space-y-3" onSubmit={submitEmail}><label className={fieldClass}><Mail className="text-primary" size={18} /><input className="min-w-0 flex-1 bg-transparent text-base outline-none" type="email" autoComplete="email" aria-label="邮箱地址" placeholder="请输入邮箱地址" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className={fieldClass}><ShieldCheck className="text-primary" size={18} /><input ref={codeInputRef} className="min-w-0 flex-1 bg-transparent text-base outline-none" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="请输入验证码" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /><button className="min-h-11 shrink-0 text-sm font-semibold text-primary disabled:text-text-secondary/60" disabled={!emailIsValid || countdown > 0 || busy} onClick={() => void requestEmailCode()} type="button">{countdown ? `${countdown}s` : '获取验证码'}</button></label><div className="min-h-5 px-1" aria-live="polite">{error ? <p className="text-xs text-danger">{error}</p> : notice ? <p className="text-xs text-primary">{notice}</p> : null}</div><HohoButton fullWidth loading={busy} size="large" type="submit" disabled={!emailIsValid || !CODE_PATTERN.test(code)}>继续</HohoButton></form></> : method === 'phone-code' ? <form aria-labelledby="login-method-heading" className="mt-4 space-y-3" onSubmit={submitPhone}>
      <label className={fieldClass}><Smartphone aria-hidden="true" className="shrink-0 text-primary" size={18} /><span className="text-sm text-text-secondary">+86</span><input aria-label="手机号" className="min-w-0 flex-1 bg-transparent text-base outline-none" name="tel" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={11} placeholder="请输入中国大陆手机号" value={phone} onChange={(event) => { setPhone(event.target.value.replace(/\D/g, '')); setPhoneCode(''); setError(''); setNotice('') }} disabled={busy} /></label>
      <label className={fieldClass}><ShieldCheck aria-hidden="true" className="shrink-0 text-primary" size={18} /><input aria-label="短信验证码" ref={phoneCodeInputRef} className="min-w-0 flex-1 bg-transparent text-base outline-none" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="请输入短信验证码" value={phoneCode} onChange={(event) => { setPhoneCode(event.target.value.replace(/\D/g, '')); setError('') }} /><button className="min-h-11 shrink-0 text-sm font-semibold text-primary disabled:text-text-secondary/60" disabled={!phoneIsValid || phoneCountdown > 0 || busy} onClick={() => void requestPhoneCode()} type="button">{phoneCountdown ? `${phoneCountdown}s` : '获取验证码'}</button></label>
      <div className="min-h-5 px-1" aria-live="polite">{error ? <p role="alert" className="text-xs text-danger">{error}</p> : notice ? <p className="text-xs text-primary">{notice}</p> : null}</div>
      <HohoButton fullWidth loading={busy} size="large" type="submit" disabled={!phoneIsValid || !CODE_PATTERN.test(phoneCode)}>继续</HohoButton>
      <HohoButton fullWidth variant="text" onClick={() => selectMethod('phone-password')}>使用手机号密码登录</HohoButton>
    </form> : <div className="mt-4 space-y-4">
      <p role="status" className="hoho-text-body text-text-secondary">{method === 'apple' ? 'Apple 登录正在接入，请先使用邮箱或账号密码登录。' : '手机号密码登录正在接入，请先使用邮箱或账号密码登录。'}</p>
      {method === 'phone-password' && <HohoButton fullWidth variant="secondary" size="large" onClick={() => selectMethod('phone-code')}>使用手机验证码</HohoButton>}
      <HohoButton fullWidth size="large" onClick={() => selectMethod('email')}>使用邮箱登录</HohoButton>
      <HohoButton fullWidth variant="text" onClick={() => selectMethod('account')}>使用账号密码登录</HohoButton>
    </div>}</> : <><div className="mt-5 grid grid-cols-2 rounded-control border bg-surface p-1" role="tablist" aria-label="登录或注册">{(['login', 'register'] as const).map((value) => <button aria-selected={mode === value} className={`min-h-10 rounded-[12px] text-sm font-semibold transition ${mode === value ? 'bg-primary/15 text-primary' : 'text-text-secondary'}`} key={value} onClick={() => { setMode(value); setError(''); setPassword('') }} role="tab" type="button">{value === 'register' ? '注册' : '登录'}</button>)}</div><form className="mt-4 space-y-3" onSubmit={submitPrimary}><label className={fieldClass}><UserRound className="shrink-0 text-primary" size={19} /><input className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-secondary/60" name="username" autoCapitalize="off" autoComplete="username" maxLength={20} placeholder={mode === 'register' ? '给自己起个昵称' : '输入你的昵称'} value={nickname} onChange={(event) => { setNickname(event.target.value); setError('') }} /></label><label className={fieldClass}><LockKeyhole className="shrink-0 text-primary" size={19} /><input className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-secondary/60" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} maxLength={64} placeholder={mode === 'register' ? '设置一个密码' : '输入密码'} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} /><button className="grid h-11 w-11 place-items-center text-text-secondary" type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></label>{mode === 'login' && <label className="flex min-h-10 cursor-pointer items-center gap-2 px-1 text-sm text-text-secondary"><input className="h-[18px] w-[18px] shrink-0 accent-primary" name="remember" type="checkbox" checked={rememberLogin} onChange={(event) => { const checked = event.target.checked; setRememberLogin(checked); setRememberPreference(checked); if (!checked) rememberNickname() }} /><span>记住登录信息</span></label>}<div className="min-h-5 px-1" aria-live="polite">{error ? <p className="text-xs text-danger">{error}</p> : null}</div><HohoButton fullWidth loading={busy} size="large" type="submit">{mode === 'register' ? (authUser?.guest ? '创建账号以保留记录' : '注册并进入') : '登录'}</HohoButton></form><div className="my-3 flex items-center gap-3 text-xs text-text-secondary"><span className="h-px flex-1 bg-border" /><span>或</span><span className="h-px flex-1 bg-border" /></div><div className="grid grid-cols-4 gap-2" aria-label="其他登录方式">{secondaryMethods.map((item) => <button aria-label={item.label} className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 text-primary disabled:opacity-50" disabled={busy} key={item.method} type="button" onClick={() => selectMethod(item.method)}><span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full border bg-surface">{item.icon}</span><span className="whitespace-nowrap text-[11px] text-text-secondary">{item.caption}</span></button>)}</div><p className="mt-4 text-center text-[11px] leading-5 text-text-secondary">{mode === 'register' ? '注册' : '登录'}即表示同意 <span>《用户协议》</span> 和 <span>《隐私政策》</span></p></>}
  </div></main>
}
