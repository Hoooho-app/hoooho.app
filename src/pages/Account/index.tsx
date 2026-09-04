import { Apple, Camera, ImageUp, Mail, Phone, ShieldAlert, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, WebPageHeader } from '../../components/common'
import { BottomSheetSurface, HohoButton, HohoInput, HohoSurfaceRow, StatusNotice } from '../../components/design-system'
import { MembershipBadge } from '../../components/account/AccountSheet'
import { accountService, maskEmail, maskPhone } from '../../services/account'
import { ApiRequestError } from '../../services/apiClient'
import { useAppStore } from '../../store/useAppStore'
import type { AccountProfile, AccountProvider } from '../../types'
import { AvatarPhotoError, createAvatarPhotoPreview, prepareAvatarPhoto } from '../../utils/prepareAvatarPhoto'

function message(error: unknown) {
  return error instanceof ApiRequestError ? error.message : '操作失败，请稍后重试'
}

function AccountLayout({ children, title, fallback = '/account/security', action }: { children: ReactNode; title: string; fallback?: string; action?: ReactNode }) {
  return <main className="account-page app-shell pb-0"><WebPageHeader action={action} fallback={fallback} title={title} /><div className="account-content">{children}</div></main>
}

function useAccount() {
  const token = useAppStore((state) => state.authToken)
  const profile = useAppStore((state) => state.accountProfile)
  const setProfile = useAppStore((state) => state.setAccountProfile)
  const [loading, setLoading] = useState(!profile)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!token || profile) return
    void accountService.get(token).then(setProfile).catch((e) => setError(message(e))).finally(() => setLoading(false))
  }, [profile, setProfile, token])
  return { token: token ?? '', profile, setProfile, loading, error }
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="settings-section-label">{title}</h2><div className="settings-list">{children}</div></section>
}

export function AccountSecurityPage() {
  const navigate = useNavigate()
  const { profile, loading, error } = useAccount()
  return <AccountLayout fallback="/health-events" title="账户与安全">
    {loading && <StatusNotice title="正在加载账户资料" />}
    {error && <StatusNotice title={error} tone="error" />}
    {profile && <>
      <Group title="个人资料">
        <HohoSurfaceRow leading={<Avatar name={profile.nickname} src={profile.avatar ?? undefined} size="md" />} onActivate={() => navigate('/account/avatar')} title="头像" value="编辑" />
        <HohoSurfaceRow onActivate={() => navigate('/account/nickname')} title="昵称" value={profile.nickname} />
      </Group>
      <Group title="登录与绑定">
        <HohoSurfaceRow leading={<Phone size={19} />} onActivate={() => navigate('/account/phone')} title="手机号" value={maskPhone(profile.phone)} />
        <HohoSurfaceRow leading={<Mail size={19} />} onActivate={() => navigate('/account/email')} title="邮箱" value={maskEmail(profile.email)} />
        <HohoSurfaceRow leading={<ShieldAlert size={19} />} onActivate={() => navigate('/account/providers')} title="第三方账户" value={`${profile.providers.filter((item) => item.bound).length} 个已绑定`} />
      </Group>
      <Group title="危险操作"><HohoSurfaceRow className="account-danger-row" onActivate={() => navigate('/account/delete')} title="删除账户" /></Group>
    </>}
  </AccountLayout>
}

export function AccountNicknamePage() {
  const navigate = useNavigate()
  const { token, profile, setProfile } = useAccount()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const initialized = useRef(false)
  useEffect(() => { if (profile && !initialized.current) { initialized.current = true; setValue(profile.nickname) } }, [profile])
  const save = async () => {
    const nickname = value.trim()
    if (!nickname || /\s/u.test(nickname) || nickname.length > 20) return setError('昵称为 1–20 个字符，且不能包含空格')
    setSaving(true); setError('')
    try { setProfile(await accountService.update(token, { nickname })); navigate('/account/security', { replace: true }) } catch (e) { setError(message(e)) } finally { setSaving(false) }
  }
  return <AccountLayout title="修改昵称" action={<button className="account-header-action" disabled={saving} onClick={() => void save()} type="button">保存</button>}>
    <HohoInput autoFocus error={error} hint={!error ? '最多 20 个字符，仅用于 Hoooho 内展示。' : undefined} label="昵称" maxLength={20} value={value} onChange={(e) => { setValue(e.target.value); setError('') }} />
  </AccountLayout>
}

export function AccountAvatarPage() {
  const navigate = useNavigate()
  const { token, profile, setProfile } = useAccount()
  const albumRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ src: string; file: File } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try { const image = await createAvatarPhotoPreview(file); setPreview({ src: image.src, file }) } catch (e) { setError(e instanceof AvatarPhotoError && e.reason === 'unsupported' ? '请选择 JPEG、PNG、WebP 或设备支持的 HEIC 照片' : '照片无法读取或处理，请重新选择') }
  }
  const save = async (restore = false) => {
    setSaving(true); setError('')
    try {
      const avatar = restore ? null : preview ? await prepareAvatarPhoto(preview.file, { zoom, offsetX, offsetY }) : profile?.avatar ?? null
      setProfile(await accountService.update(token, { avatar }))
      navigate('/account/security', { replace: true })
    } catch (e) { setError(message(e)) } finally { setSaving(false) }
  }
  return <AccountLayout title="修改头像" action={preview ? <button className="account-header-action" disabled={saving} onClick={() => void save()} type="button">完成</button> : undefined}>
    <div className="account-avatar-preview"><img alt="头像裁剪预览" src={preview?.src ?? profile?.avatar ?? undefined} className={preview || profile?.avatar ? 'account-avatar-image' : 'hidden'} />{!preview && !profile?.avatar && <Avatar name={profile?.nickname ?? '用户'} size="xl" />}</div>
    {preview && <div className="account-crop-controls">
      <label>缩放<input aria-label="头像缩放" max="3" min="1" step=".05" type="range" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
      <label>左右<input aria-label="头像左右位置" max="1" min="-1" step=".05" type="range" value={offsetX} onChange={(e) => setOffsetX(Number(e.target.value))} /></label>
      <label>上下<input aria-label="头像上下位置" max="1" min="-1" step=".05" type="range" value={offsetY} onChange={(e) => setOffsetY(Number(e.target.value))} /></label>
    </div>}
    <div className="settings-list">
      <button className="account-choice" type="button" onClick={() => albumRef.current?.click()}><ImageUp size={20} />从相册选择照片</button>
      <button className="account-choice" type="button" onClick={() => cameraRef.current?.click()}><Camera size={20} />拍摄新照片</button>
      <button className="account-choice" disabled={saving} type="button" onClick={() => void save(true)}><UserRound size={20} />使用“{(profile?.nickname ?? '用').slice(0, 1)}”字头像</button>
    </div>
    <input accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" ref={albumRef} type="file" onChange={(e) => void choose(e)} />
    <input accept="image/*" capture="user" className="sr-only" ref={cameraRef} type="file" onChange={(e) => void choose(e)} />
    {error && <StatusNotice title={error} tone="error" />}
    {preview && <HohoButton fullWidth variant="secondary" onClick={() => setPreview(null)}>取消本次选择</HohoButton>}
  </AccountLayout>
}

function CodeButton({ countdown, disabled, onClick }: { countdown: number; disabled: boolean; onClick: () => void }) {
  return <button className="account-code-button" disabled={disabled || countdown > 0} onClick={onClick} type="button">{countdown > 0 ? `${countdown}s 后重试` : '获取验证码'}</button>
}

export function AccountBindingPage({ kind }: { kind: 'phone' | 'email' }) {
  const navigate = useNavigate()
  const { token, profile, setProfile } = useAccount()
  const current = kind === 'phone' ? profile?.phone : profile?.email
  const [step, setStep] = useState<'current' | 'new'>(() => kind === 'phone' && Boolean(current) ? 'current' : 'new')
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (countdown < 1) return; const timer = setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 1000); return () => clearInterval(timer) }, [countdown])
  useEffect(() => { if (kind === 'phone' && current && !challenge) setStep('current') }, [challenge, current, kind])
  const target = step === 'current' ? current ?? '' : value.trim().toLowerCase()
  const send = async () => {
    setBusy(true); setError(''); setNotice('')
    try { const result = await accountService.sendCode(token, kind, target); setCountdown(result.retryAfter); setNotice('验证码已发送') } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) return setError('请输入 6 位数字验证码')
    setBusy(true); setError('')
    try {
      if (step === 'current') {
        const result = await accountService.verifyCurrent(token, kind, code)
        setChallenge(result.changeToken); setStep('new'); setCode(''); setCountdown(0); setNotice('原手机号已验证，请设置新手机号')
      } else {
        setProfile(await accountService.bind(token, kind, target, code, challenge))
        navigate('/account/security', { replace: true })
      }
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  const title = kind === 'phone' ? (current ? '更换手机号' : '设置手机号') : (current ? '更换邮箱' : '设置邮箱')
  return <AccountLayout title={title}>
    {current && <div className="settings-list"><HohoSurfaceRow title={kind === 'phone' ? '当前手机号' : '当前邮箱'} value={<span>{kind === 'phone' ? maskPhone(current) : maskEmail(current)} <span className="account-verified-badge">已验证</span></span>} /></div>}
    {step === 'current'
      ? <StatusNotice title="先验证原手机号">原手机号不可用时，当前版本暂不支持自助申诉，请通过帮助与反馈联系我们。</StatusNotice>
      : <HohoInput autoFocus label={kind === 'phone' ? '新手机号（+86）' : '新邮箱'} inputMode={kind === 'phone' ? 'tel' : 'email'} placeholder={kind === 'phone' ? '请输入 11 位手机号' : '请输入新邮箱地址'} value={value} onChange={(e) => { setValue(e.target.value.replace(kind === 'phone' ? /\D/g : /$^/, '')); setError('') }} />}
    <div className="account-code-row"><HohoInput label={kind === 'phone' ? '短信验证码' : '邮箱验证码'} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /><CodeButton countdown={countdown} disabled={busy || !target} onClick={() => void send()} /></div>
    {notice && <StatusNotice title={notice} tone="success" />}
    {error && <StatusNotice title={error} tone="error" />}
    <HohoButton fullWidth loading={busy} size="large" disabled={code.length !== 6} onClick={() => void confirm()}>{step === 'current' ? '验证并继续' : kind === 'phone' ? '确认绑定' : '确认更换'}</HohoButton>
  </AccountLayout>
}

export function AccountPhonePage() { return <AccountBindingPage kind="phone" /> }
export function AccountEmailPage() { return <AccountBindingPage kind="email" /> }

function ProviderMark({ provider }: { provider: AccountProvider }) {
  if (provider === 'apple') return <span className="provider-mark apple"><Apple size={21} fill="currentColor" /></span>
  if (provider === 'wechat') return <span className="provider-mark wechat"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9.2 5c-4 0-7.2 2.5-7.2 5.7 0 1.8 1 3.5 2.7 4.5l-.7 2.3 2.7-1.3c.8.2 1.6.3 2.5.3 4 0 7.2-2.6 7.2-5.8S13.2 5 9.2 5Zm-2.5 4.2a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/><path d="M22 15.1c0-2.6-2.6-4.8-5.8-4.8-.5 0-1 .1-1.5.2 0 .1.1.3.1.5 0 3.7-3.5 6.6-7.8 6.6h-.5c1 1.4 2.9 2.3 5.1 2.3.7 0 1.4-.1 2-.3l2.2 1.1-.6-1.9c1.7-.8 2.8-2.1 2.8-3.7Zm-7.8-.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm4 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z"/></svg></span>
  return <span className="provider-mark qq"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2c-3 0-5 2.7-5 6.4 0 .6.1 1.2.2 1.8C5.9 11.6 5 14 5.6 15.3c.3.6.9.5 1.6.1.4 2.9 2.2 5 4.8 5s4.4-2.1 4.8-5c.7.4 1.3.5 1.6-.1.6-1.3-.3-3.7-1.6-5.1.1-.6.2-1.2.2-1.8C17 4.7 15 2 12 2Zm-2 7.2c-.5 0-.9-.6-.9-1.3s.4-1.3.9-1.3.9.6.9 1.3-.4 1.3-.9 1.3Zm4 0c-.5 0-.9-.6-.9-1.3s.4-1.3.9-1.3.9.6.9 1.3-.4 1.3-.9 1.3Z"/></svg></span>
}

export function AccountProvidersPage() {
  const { token, profile, setProfile } = useAccount()
  const [selected, setSelected] = useState<AccountProvider | null>(null)
  const [error, setError] = useState('')
  const act = async (provider: AccountProvider, action: 'bind' | 'unbind') => {
    setError('')
    try { setProfile(await accountService.provider(token, provider, action)); setSelected(null) } catch (e) { setError(message(e)) }
  }
  return <AccountLayout title="第三方账户">
    <div className="settings-list">{profile?.providers.map((item) => <div className="provider-row" key={item.provider}>
      <ProviderMark provider={item.provider} /><span className="flex-1 font-medium">{item.label}</span>
      {item.displayName && <span className="text-sm text-text-secondary">{item.displayName}</span>}
      <button className={item.bound ? 'provider-bound' : 'provider-bind'} type="button" onClick={() => item.bound ? setSelected(item.provider) : void act(item.provider, 'bind')}>{item.bound ? '已绑定' : '绑定'}</button>
    </div>)}</div>
    <p className="settings-note">绑定会跳转至对应平台授权；当前平台未配置时会明确提示“暂未开放”，不会伪造成功。</p>
    {error && <StatusNotice title={error} tone="error" />}
    <BottomSheetSurface label="管理第三方账户" onClose={() => setSelected(null)} open={selected !== null} title="解除绑定">
      <p className="hoho-text-body">解除前会确认账户仍保留至少一种可用登录方式。</p>
      <HohoButton className="mt-4" fullWidth variant="danger" onClick={() => selected && void act(selected, 'unbind')}>确认解除绑定</HohoButton>
    </BottomSheetSurface>
  </AccountLayout>
}

export function AccountMembershipPage() {
  return <AccountLayout fallback="/health-events" title="会员状态"><section className="account-membership-card"><MembershipBadge /><h2>免费版</h2><p>当前正在使用 Hoooho 免费版。</p></section><p className="settings-note text-center">更多版本与权益将在正式确定后展示。</p></AccountLayout>
}

export function AccountDeletePage() {
  const navigate = useNavigate()
  const { token, profile } = useAccount()
  const clear = useAppStore((state) => state.clearAuthSession)
  const [accepted, setAccepted] = useState(false)
  const [kind, setKind] = useState<'phone' | 'email'>(() => profile?.email ? 'email' : 'phone')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleteToken, setDeleteToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (profile?.email) setKind('email'); else if (profile?.phone) setKind('phone') }, [profile])
  const send = async () => { setBusy(true); setError(''); try { await accountService.sendDeleteCode(token, kind); setSent(true) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  const verify = async () => { setBusy(true); setError(''); try { const result = await accountService.verifyDelete(token, kind, code); setDeleteToken(result.deleteToken); setConfirming(true) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  const remove = async () => { setBusy(true); setError(''); try { await accountService.delete(token, deleteToken); clear(); navigate('/login', { replace: true }) } catch (e) { setError(message(e)); setConfirming(false) } finally { setBusy(false) } }
  return <AccountLayout title="删除账户">
    <section className="account-delete-box"><h2>删除后无法恢复</h2><p>你的账户、孩子资料、健康随记、健康档案和已生成的问诊摘要将被永久删除。</p><label><input checked={accepted} type="checkbox" onChange={(e) => setAccepted(e.target.checked)} />我已了解以上内容，并确认继续删除账户</label></section>
    {accepted && <>
      <label className="hoho-field"><span className="hoho-text-label">身份验证方式</span><select className="hoho-input" value={kind} onChange={(e) => setKind(e.target.value as 'phone' | 'email')} disabled={sent}>{profile?.email && <option value="email">邮箱 {maskEmail(profile.email)}</option>}{profile?.phone && <option value="phone">手机号 {maskPhone(profile.phone)}</option>}</select></label>
      {!sent ? <HohoButton fullWidth loading={busy} onClick={() => void send()}>发送验证码</HohoButton> : <>
        <HohoInput label="验证码" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <HohoButton fullWidth loading={busy} variant="danger" disabled={code.length !== 6} onClick={() => void verify()}>验证身份并继续</HohoButton>
      </>}
    </>}
    {error && <StatusNotice title={error} tone="error" />}
    <BottomSheetSurface label="最终确认删除账户" onClose={() => setConfirming(false)} open={confirming} title="最后确认">
      <p className="hoho-text-body">这是最后一步。确认后账户与所属健康数据将永久删除，无法恢复。</p>
      <HohoButton className="mt-4" fullWidth loading={busy} variant="danger" onClick={() => void remove()}>永久删除账户</HohoButton>
      <HohoButton className="mt-3" fullWidth variant="secondary" onClick={() => setConfirming(false)}>取消</HohoButton>
    </BottomSheetSurface>
  </AccountLayout>
}
