import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, Check, ChevronRight, Clipboard, Home, Leaf, LockKeyhole, LogOut, Menu, NotebookPen, ShieldCheck, Sparkles, Target, Users, Wallet, X } from 'lucide-react'
import { HohoButton } from '../../components/design-system/HohoButton'
import { HohoInput } from '../../components/design-system/HohoInput'
import { HealthCard } from '../../components/design-system/HealthCard'
import { EmptyState } from '../../components/design-system/EmptyState'
import { StatusNotice } from '../../components/design-system/StatusNotice'
import { ConfirmDialog } from '../../components/design-system/ConfirmDialog'
import { FAMILY_WORKSPACE_PATH } from '../../../shared/family-workspace.mjs'
import './family-workspace.css'

type Session = { authenticated: false } | { authenticated: true; role: 'admin' | 'member'; name: string; expiresAt: number }
type AccessCode = { id: string; label: string; createdAt: number; expiresAt: number; lastUsedAt: number | null; status: 'active' | 'expired' | 'revoked' }
type GeneratedCode = AccessCode & { loginCode: string }
type Section = 'overview' | 'expenses' | 'plans' | 'schedule' | 'notes' | 'access'
class FamilyApiError extends Error { constructor(message: string, public status: number) { super(message) } }
async function api<T>(route: string, input?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${FAMILY_WORKSPACE_PATH}/api${route}`, { method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: input === undefined ? undefined : { 'Content-Type': 'application/json', 'X-Hoooho-Family': '1' }, body: input === undefined ? undefined : JSON.stringify(input), signal })
  const body = await response.json()
  if (!response.ok) throw new FamilyApiError(body.error?.message || '操作未完成，请稍后再试。', response.status)
  return body as T
}
const messageOf = (error: unknown) => error instanceof Error ? error.message : '连接暂时不可用，请稍后再试。'
const dateTime = (time: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time)
const links = [
  { id: 'overview' as const, title: '生活总览', icon: Home },
  { id: 'expenses' as const, title: '家庭账本', icon: Wallet },
  { id: 'plans' as const, title: '财务计划', icon: Target },
  { id: 'schedule' as const, title: '家庭日程', icon: CalendarDays },
  { id: 'notes' as const, title: '生活备忘', icon: NotebookPen }
]

export function FamilyWorkspacePage() {
  const [session, setSession] = useState<Session>()
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [expired, setExpired] = useState(false)
  const loadSession = useCallback(async (signal?: AbortSignal) => {
    try { const current = await api<Session>('/session', undefined, signal); if (!signal?.aborted) { setSession(current); setError('') } }
    catch (error) { if (!signal?.aborted) setError(messageOf(error)) }
    finally { if (!signal?.aborted) setChecking(false) }
  }, [])
  useEffect(() => { const controller = new AbortController(); void loadSession(controller.signal); return () => controller.abort() }, [loadSession])
  useEffect(() => {
    document.title = '家庭统筹会 · 家序'
    if (!session?.authenticated) return
    const expire = () => { setExpired(true); setSession({ authenticated: false }) }
    const timer = window.setTimeout(() => { if (session.expiresAt <= Date.now()) expire() }, Math.min(2_147_483_647, Math.max(0, session.expiresAt - Date.now())))
    const refresh = async () => {
      if (session.expiresAt <= Date.now()) { expire(); return }
      try {
        const current = await api<Session>('/session')
        if (!current.authenticated) expire()
      } catch { /* Every server operation still requires a valid session. */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = window.setInterval(() => void refresh(), 30_000)
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [session])
  if (checking || (!session && error)) return <main className="family-entry"><HealthCard className="family-login-card"><Leaf aria-hidden="true"/><h1 className="hoho-text-page-title">家庭统筹会</h1>{error ? <StatusNotice tone="error" title="暂时无法验证登录状态" action={<HohoButton onClick={() => { setChecking(true); void loadSession() }}>重试</HohoButton>}>{error}</StatusNotice> : <p role="status">正在确认你的登录状态…</p>}</HealthCard></main>
  if (!session?.authenticated) return <FamilyLogin expired={expired} onLogin={next => { setSession(next); setExpired(false) }}/>
  return <FamilyHome session={session} onLogout={() => setSession({ authenticated: false })}/>
}

function FamilyLogin({ onLogin, expired }: { onLogin: (session: Session) => void; expired: boolean }) {
  const [admin, setAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const submitting = useRef(false)
  useEffect(() => { if (!cooldown) return; const id = window.setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(id) }, [cooldown])
  const switchMode = (value: boolean) => { setAdmin(value); setCode(''); setError(''); setNotice('') }
  const sendCode = async () => {
    if (sending || cooldown || !email.trim()) return
    setSending(true); setError(''); setNotice('')
    try { const result = await api<{ retryAfter: number }>('/admin/send-code', { email }); setCooldown(result.retryAfter); setNotice('如果是已授权的管理员邮箱，验证码会发送到该邮箱。请检查收件箱与垃圾邮件。') }
    catch (error) { setError(messageOf(error)) }
    finally { setSending(false) }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true; setLoading(true); setError('')
    try { onLogin(await api<Session>(admin ? '/admin/login' : '/member/login', { email, code, remember })); setCode('') }
    catch (error) { setError(messageOf(error)) }
    finally { submitting.current = false; setLoading(false) }
  }
  return <main className="family-entry"><div className="family-entry-intro"><span className="family-wordmark"><Home size={24} aria-hidden="true"/>家序</span><p className="hoho-text-caption">RAY'S FAMILY SPACE</p><h1 className="hoho-text-display">一家人的生活，<br/>在这里慢慢理顺。</h1><p>开支、计划、日程，还有生活里的小事。<br/>一个只属于家人的小天地。</p><span className="family-entry-note"><LockKeyhole size={16} aria-hidden="true"/>打开链接后，需要授权才能进入。</span></div><HealthCard className="family-login-card"><span className="family-login-mark"><Leaf aria-hidden="true"/></span><h2 className="hoho-text-page-title">家庭统筹会</h2><p className="hoho-text-body-small">欢迎回到我们的小天地。</p><div className="family-login-tabs" role="tablist" aria-label="登录方式"><button type="button" role="tab" id="family-member-tab" aria-selected={!admin} aria-controls="family-login-panel" tabIndex={!admin ? 0 : -1} onClick={() => switchMode(false)} onKeyDown={e => { if (e.key === 'ArrowRight') { switchMode(true); document.getElementById('family-admin-tab')?.focus() } }}>家人登录</button><button type="button" role="tab" id="family-admin-tab" aria-selected={admin} aria-controls="family-login-panel" tabIndex={admin ? 0 : -1} onClick={() => switchMode(true)} onKeyDown={e => { if (e.key === 'ArrowLeft') { switchMode(false); document.getElementById('family-member-tab')?.focus() } }}>管理员登录</button></div><form id="family-login-panel" role="tabpanel" aria-labelledby={admin ? 'family-admin-tab' : 'family-member-tab'} onSubmit={event => void submit(event)}>
      {expired && <StatusNotice tone="warning" title="登录已到期或已被撤销">请重新验证；家人可联系 Ray 获取新的登录码。</StatusNotice>}
      {admin && <HohoInput label="管理员邮箱" id="family-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="输入 Ray 的管理员邮箱" required maxLength={254} disabled={loading || sending}/>}
      <HohoInput label={admin ? '邮箱验证码' : '家人登录码'} id="family-code" type="text" inputMode={admin ? 'numeric' : 'text'} autoComplete={admin ? 'one-time-code' : 'off'} autoCapitalize="characters" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} placeholder={admin ? '输入 6 位邮箱验证码' : '输入 Ray 发给你的登录码'} required maxLength={admin ? 6 : 80} pattern={admin ? '[0-9]{6}' : undefined} disabled={loading} hint={admin ? '仅 Ray 的管理员邮箱可以登录。' : '登录码自生成起有效 30 天，到期后请联系 Ray。'}/>
      {admin && <HohoButton fullWidth variant="secondary" onClick={() => void sendCode()} loading={sending} disabled={Boolean(cooldown) || !email.trim() || loading}>{cooldown ? `${cooldown} 秒后可重新获取` : '获取邮箱验证码'}</HohoButton>}
      <label className="family-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={loading}/><span>在这台设备上记住登录<small>最多 30 天，且不超过家人登录码的有效期</small></span></label>
      {error && <StatusNotice tone="error" title="登录未完成">{error}</StatusNotice>}{notice && <StatusNotice title="请查收验证码">{notice}</StatusNotice>}
      <HohoButton fullWidth type="submit" loading={loading} disabled={!code.trim() || (admin && !email.trim())}>{admin ? '登录并管理家庭空间' : '进入家庭空间'}<ChevronRight size={16} aria-hidden="true"/></HohoButton>
    </form><p className="family-login-foot">未勾选时，仅保留本次浏览器登录。<br/>家人无需注册邮箱或 ChatGPT 账号。</p></HealthCard><footer className="family-entry-footer">Hoooho · 日子慢慢过，生活好好理。</footer></main>
}

function FamilyHome({ session, onLogout }: { session: Extract<Session, { authenticated: true }>; onLogout: () => void }) {
  const [section, setSection] = useState<Section>('overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const logout = async () => {
    if (leaving) return
    setLeaving(true); setError('')
    try { await api('/logout', {}); onLogout() } catch (error) { setError(messageOf(error)) } finally { setLeaving(false) }
  }
  const choose = (view: Section) => { setSection(view); setMobileNav(false); setError('') }
  const chat = <section className="family-chat" aria-label="生活助手"><div className="family-chat-title"><Sparkles size={19} aria-hidden="true"/><h2 className="hoho-text-section-title">生活助手</h2><HohoButton className="family-chat-close" variant="ghost" size="icon" aria-label="关闭聊天区域" onClick={() => setChatOpen(false)}><X size={18}/></HohoButton></div><p className="hoho-text-caption">AI 尚未开启</p><div className="family-chat-intro"><Leaf size={33} aria-hidden="true"/><h3 className="hoho-text-section-title">生活的琐碎，<br/>可以一起理。</h3><p>一笔开支，一个打算，<br/>或是还没想清楚的小事。</p></div><div className="family-prompts">{['想把家里的开支理清楚','帮我安排接下来的一周','给家里定个小小的目标'].map(text => <HohoButton key={text} variant="secondary" fullWidth onClick={() => setDraft(text)}>{text}<ChevronRight size={14}/></HohoButton>)}</div><label className="family-draft"><span className="hoho-text-label">消息草稿</span><textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} placeholder="说说你想理清的事…" rows={4}/></label><p className="hoho-text-caption">聊天界面已就绪，当前内容不会发送给 AI。</p></section>
  return <div className="family-workspace"><header className="family-mobile-header"><HohoButton variant="ghost" size="icon" aria-label={mobileNav ? '关闭导航' : '打开导航'} aria-expanded={mobileNav} aria-controls="family-nav" onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X/> : <Menu/>}</HohoButton><span>家序 · 家庭统筹会</span><HohoButton variant="ghost" size="icon" aria-label="打开生活助手" aria-expanded={chatOpen} onClick={() => setChatOpen(!chatOpen)}><Sparkles/></HohoButton></header><aside className={`family-sidebar ${mobileNav ? 'is-open' : ''}`} id="family-nav"><div className="family-wordmark"><Home size={23} aria-hidden="true"/>家序</div><p className="hoho-text-caption">RAY'S FAMILY SPACE</p><nav aria-label="家庭空间导航">{links.map(link => <button key={link.id} type="button" aria-current={section === link.id ? 'page' : undefined} onClick={() => choose(link.id)}><link.icon size={18} aria-hidden="true"/>{link.title}</button>)}{session.role === 'admin' && <button type="button" aria-current={section === 'access' ? 'page' : undefined} onClick={() => choose('access')}><Users size={18} aria-hidden="true"/>家人访问管理</button>}</nav><div className="family-sidebar-foot"><ShieldCheck size={17} aria-hidden="true"/><span>{session.name} · {session.role === 'admin' ? '管理员' : '家庭成员'}</span><HohoButton fullWidth size="small" variant="secondary" loading={leaving} onClick={() => void logout()}><LogOut size={15} aria-hidden="true"/>退出登录</HohoButton></div></aside><main className="family-main"><div className="family-topline"><span>我的家庭空间 / {section === 'access' ? '家人访问管理' : links.find(link => link.id === section)?.title}</span><span><LockKeyhole size={13} aria-hidden="true"/>已授权访问</span></div>{error && <StatusNotice tone="error" title="操作未完成">{error}</StatusNotice>}{section === 'access' && session.role === 'admin' ? <AccessManager onUnauthorized={onLogout}/> : <FamilyContent section={section} name={session.name} admin={session.role === 'admin'} choose={choose}/>}<footer className="family-page-footer">家序 · 一家人的生活，有条有理。</footer></main><aside className={`family-assistant ${chatOpen ? 'is-open' : ''}`}>{chat}</aside></div>
}

function FamilyContent({ section, name, admin, choose }: { section: Section; name: string; admin: boolean; choose: (section: Section) => void }) {
  const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())
  if (section === 'overview') return <><header className="family-page-heading"><p className="hoho-text-caption">{date}</p><h1 className="hoho-text-display">欢迎回家，{name}。</h1><p>今天，也把生活照顾好。</p></header><section className="family-welcome"><Leaf size={26} aria-hidden="true"/><h2 className="hoho-text-page-title">生活有序，心里有底。</h2><p>一家人的开支、计划与日常，都在这里。</p>{admin && <HohoButton variant="secondary" onClick={() => choose('access')}><Users size={16} aria-hidden="true"/>给家人生成登录码</HohoButton>}</section><section className="family-summary" aria-label="家庭概览">{[['本月支出','¥ —','等待第一笔记录'],['本月预算','¥ —','给生活留一点规划'],['今日安排','—','重要的事，慢慢记下来']].map(([label,value,hint]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}</section><h2 className="hoho-text-section-title">生活的几个角落</h2><div className="family-corners">{links.slice(1).map(link => <button key={link.id} type="button" onClick={() => choose(link.id)}><link.icon size={21} aria-hidden="true"/><span>{link.title}</span><ChevronRight size={16} aria-hidden="true"/></button>)}</div><p className="family-section-note">空间已准备好，记账、计划、日程和备忘功能将逐步开启。</p></>
  const item = links.find(link => link.id === section) ?? links[0]
  const descriptions: Record<string, string> = { expenses: '日常买菜、家庭采购和每一笔收入支出，都将有迹可循。', plans: '家庭预算、储蓄目标和期待的旅行，从一个小计划开始。', schedule: '家人的安排、生日和共同的日子，都有一个位置。', notes: '临时的念头、待买的东西和家人的小叮嘱，随手收好。' }
  return <><header className="family-page-heading"><p className="hoho-text-caption">{date}</p><h1 className="hoho-text-display">{item.title}</h1><p>{descriptions[section]}</p></header><HealthCard className="family-empty-card"><EmptyState icon={<item.icon size={32}/>} title="这里准备好了" description="当前为页面预览，具体管理功能将在后续开启。"/></HealthCard>{section === 'schedule' && <SimpleCalendar/>}</>
}

function SimpleCalendar() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const year = value('year'), month = value('month'), today = value('day')
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const weeks = Math.ceil((offset + days) / 7)
  return <section className="family-calendar"><h2 className="hoho-text-section-title">{year} 年 {month} 月</h2><table><caption className="sr-only">当月日历，尚未添加安排</caption><thead><tr>{['一','二','三','四','五','六','日'].map(day => <th key={day} scope="col">{day}</th>)}</tr></thead><tbody>{Array.from({ length: weeks }, (_, week) => <tr key={week}>{Array.from({ length: 7 }, (_, weekday) => { const day = week * 7 + weekday - offset + 1; return <td key={weekday} aria-current={day === today ? 'date' : undefined}>{day > 0 && day <= days ? day : ''}</td> })}</tr>)}</tbody></table></section>
}

function AccessManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [codes, setCodes] = useState<AccessCode[]>()
  const [label, setLabel] = useState('')
  const [generated, setGenerated] = useState<GeneratedCode>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revoke, setRevoke] = useState<AccessCode>()
  const pending = useRef(false)
  const handleError = useCallback((error: unknown) => { if (error instanceof FamilyApiError && (error.status === 401 || error.status === 403)) onUnauthorized(); else setError(messageOf(error)) }, [onUnauthorized])
  const reload = useCallback(async () => { try { setCodes((await api<{ codes: AccessCode[] }>('/codes')).codes) } catch (error) { handleError(error) } }, [handleError])
  const initial = useRef(false)
  useEffect(() => { if (initial.current) return; initial.current = true; void reload() }, [reload])
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setCopied(false)
    try { const result = await api<GeneratedCode>('/codes', { label }); setGenerated(result); setLabel(''); await reload() }
    catch (error) { handleError(error) } finally { pending.current = false; setBusy(false) }
  }
  const revokeCode = async () => {
    if (!revoke || pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await api(`/codes/${revoke.id}/revoke`, {}); if (generated?.id === revoke.id) setGenerated(undefined); setRevoke(undefined); await reload() }
    catch (error) { handleError(error) } finally { pending.current = false; setBusy(false) }
  }
  const copy = async () => {
    if (!generated) return
    try { await navigator.clipboard.writeText(`我们的家庭空间：${location.origin}${FAMILY_WORKSPACE_PATH}\n家人登录码：${generated.loginCode}\n有效期至 ${dateTime(generated.expiresAt)}（北京时间），请妥善保存。`); setCopied(true) }
    catch { setError('自动复制未成功，请长按选中登录码，手动复制。') }
  }
  return <><header className="family-page-heading"><p className="hoho-text-caption">只有你可以管理</p><h1 className="hoho-text-display">让家人，一起进来。</h1><p>给每位家人一个登录码，有效 30 天，可随时撤销。</p></header><HealthCard className="family-access-create"><h2 className="hoho-text-section-title">生成家人登录码</h2><form onSubmit={event => void create(event)}><HohoInput id="family-label" label="家人称呼" placeholder="例如：妈妈、爸爸" value={label} onChange={event => setLabel(event.target.value)} maxLength={30} required disabled={busy}/><HohoButton type="submit" loading={busy} disabled={!label.trim()}>生成 30 天登录码</HohoButton></form>{generated && <div className="family-generated" role="status"><h3 className="hoho-text-card-title">{generated.label}的登录码已生成</h3><label className="hoho-text-label" htmlFor="generated-family-code">登录码（仅本次显示）</label><input className="hoho-input" id="generated-family-code" readOnly value={generated.loginCode} onFocus={event => event.target.select()}/><p>有效期至 {dateTime(generated.expiresAt)}（北京时间）</p><HohoButton variant="secondary" onClick={() => void copy()}>{copied ? <Check size={16}/> : <Clipboard size={16}/>} {copied ? '已复制链接和登录码' : '复制链接和登录码'}</HohoButton><p className="hoho-text-caption">复制后由你发给家人。离开页面后不会再次显示完整登录码；遗失时可撤销后重新生成。</p></div>}</HealthCard>{error && <StatusNotice tone="error" title="操作未完成" action={!codes ? <HohoButton variant="secondary" onClick={() => void reload()}>重试</HohoButton> : undefined}>{error}</StatusNotice>}<section className="family-access-list"><h2 className="hoho-text-section-title">家人访问权限</h2>{!codes ? <p role="status">正在读取登录码…</p> : !codes.length ? <EmptyState icon={<Users size={30}/>} title="还没有家人登录码" description="生成后，家人就可以用登录码进入，无需注册账号。"/> : <ul>{codes.map(code => <li key={code.id}><div><strong>{code.label}</strong><span>{code.status === 'active' ? `有效至 ${dateTime(code.expiresAt)}` : code.status === 'expired' ? '已到期' : '已撤销'}</span>{code.lastUsedAt && <small>最近登录 {dateTime(code.lastUsedAt)}</small>}</div>{code.status === 'active' && <HohoButton variant="text" disabled={busy} onClick={() => setRevoke(code)}>撤销</HohoButton>}</li>)}</ul>}</section><ConfirmDialog open={Boolean(revoke)} title={`撤销${revoke?.label ?? ''}的登录码？`} description="撤销后，使用这个登录码的设备也会退出家庭空间。需要时可以重新生成。" confirmLabel="确认撤销" danger loading={busy} onCancel={() => setRevoke(undefined)} onConfirm={() => void revokeCode()}/></>
}
