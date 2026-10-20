import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, Building2, CalendarDays, Check, ChevronRight, Clipboard, GraduationCap, HeartPulse, Home, Landmark, LockKeyhole, LogOut, Menu, PanelRight, Scale, Search, ShieldCheck, Users, Wallet, X } from 'lucide-react'
import { HohoButton } from '../../components/design-system/HohoButton'
import { HohoInput } from '../../components/design-system/HohoInput'
import { HealthCard } from '../../components/design-system/HealthCard'
import { EmptyState } from '../../components/design-system/EmptyState'
import { StatusNotice } from '../../components/design-system/StatusNotice'
import { ConfirmDialog } from '../../components/design-system/ConfirmDialog'
import { FAMILY_WORKSPACE_PATH } from '../../../shared/family-workspace.mjs'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { defaultLocation, locationHash, resolveLocation, searchWorkspace, workspaceModules, pageSections, financeDefaultView, type FinanceView, type WorkspaceLocation, type WorkspaceModule } from './navigation'
import { api, FamilyApiError, messageOf } from './api'
import { FamilyFinance } from './finance'
import './family-workspace.css'

type Session = { authenticated: false } | { authenticated: true; role: 'admin' | 'member'; name: string; expiresAt: number }
type AccessCode = { id: string; label: string; createdAt: number; expiresAt: number; lastUsedAt: number | null; status: 'active' | 'expired' | 'revoked' }
type GeneratedCode = AccessCode & { loginCode: string }
const dateTime = (time: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time)
const moduleIcons = { finances: Wallet, assets: Landmark, legal: Scale, schedule: CalendarDays, home: Building2, health: HeartPulse, education: GraduationCap, safety: ShieldCheck, governance: Users }

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
    document.title = '家庭统筹会 · Ray 家庭空间'
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
  if (checking || (!session && error)) return <main className="family-theme family-entry"><HealthCard className="family-login-card"><Home aria-hidden="true"/><h1 className="hoho-text-page-title">家庭统筹会</h1>{error ? <StatusNotice tone="error" title="暂时无法验证登录状态" action={<HohoButton onClick={() => { setChecking(true); void loadSession() }}>重试</HohoButton>}>{error}</StatusNotice> : <p role="status">正在确认你的登录状态…</p>}</HealthCard></main>
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
  return <main className="family-theme family-entry"><div className="family-entry-intro"><span className="family-wordmark"><Home size={24} aria-hidden="true"/>家庭统筹会</span><p className="hoho-text-caption">RAY'S FAMILY SPACE</p><h1 className="hoho-text-display">家庭事务，<br/>统一管理。</h1><p>财务、资产、日程、照护与家庭决策。<br/>九大模块，一个家庭空间。</p><span className="family-entry-note"><LockKeyhole size={16} aria-hidden="true"/>打开链接后，需要授权才能进入。</span></div><HealthCard className="family-login-card"><span className="family-login-mark"><Home aria-hidden="true"/></span><h2 className="hoho-text-page-title">家庭统筹会</h2><p className="hoho-text-body-small">请验证身份后进入家庭空间。</p><div className="family-login-tabs" role="tablist" aria-label="登录方式"><button type="button" role="tab" id="family-member-tab" aria-selected={!admin} aria-controls="family-login-panel" tabIndex={!admin ? 0 : -1} onClick={() => switchMode(false)} onKeyDown={e => { if (e.key === 'ArrowRight') { switchMode(true); document.getElementById('family-admin-tab')?.focus() } }}>家人登录</button><button type="button" role="tab" id="family-admin-tab" aria-selected={admin} aria-controls="family-login-panel" tabIndex={admin ? 0 : -1} onClick={() => switchMode(true)} onKeyDown={e => { if (e.key === 'ArrowLeft') { switchMode(false); document.getElementById('family-member-tab')?.focus() } }}>管理员登录</button></div><form id="family-login-panel" role="tabpanel" aria-labelledby={admin ? 'family-admin-tab' : 'family-member-tab'} onSubmit={event => void submit(event)}>
      {expired && <StatusNotice tone="warning" title="登录已到期或已被撤销">请重新验证；家人可联系 Ray 获取新的登录码。</StatusNotice>}
      {admin && <HohoInput label="管理员邮箱" id="family-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="输入 Ray 的管理员邮箱" required maxLength={254} disabled={loading || sending}/>}
      <HohoInput label={admin ? '邮箱验证码' : '家人登录码'} id="family-code" type="text" inputMode={admin ? 'numeric' : 'text'} autoComplete={admin ? 'one-time-code' : 'off'} autoCapitalize="characters" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} placeholder={admin ? '输入 6 位邮箱验证码' : '输入 Ray 发给你的登录码'} required maxLength={admin ? 6 : 80} pattern={admin ? '[0-9]{6}' : undefined} disabled={loading} hint={admin ? '仅 Ray 的管理员邮箱可以登录。' : '登录码自生成起有效 30 天，到期后请联系 Ray。'}/>
      {admin && <HohoButton fullWidth variant="secondary" onClick={() => void sendCode()} loading={sending} disabled={Boolean(cooldown) || !email.trim() || loading}>{cooldown ? `${cooldown} 秒后可重新获取` : '获取邮箱验证码'}</HohoButton>}
      <label className="family-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={loading}/><span>在这台设备上记住登录<small>最多 30 天，且不超过家人登录码的有效期</small></span></label>
      {error && <StatusNotice tone="error" title="登录未完成">{error}</StatusNotice>}{notice && <StatusNotice title="请查收验证码">{notice}</StatusNotice>}
      <HohoButton fullWidth type="submit" loading={loading} disabled={!code.trim() || (admin && !email.trim())}>{admin ? '登录并管理家庭空间' : '进入家庭空间'}<ChevronRight size={16} aria-hidden="true"/></HohoButton>
    </form><p className="family-login-foot">未勾选时，仅保留本次浏览器登录。<br/>家人无需注册邮箱或 ChatGPT 账号。</p></HealthCard><footer className="family-entry-footer">Hoooho · 家庭统筹会</footer></main>
}

function FamilyHome({ session, onLogout }: { session: Extract<Session, { authenticated: true }>; onLogout: () => void }) {
  const admin = session.role === 'admin'
  const [current, setCurrent] = useState<WorkspaceLocation>(() => resolveLocation(window.location.hash, admin))
  const [mobileNav, setMobileNav] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const chatRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  useDialogFocus(chatOpen, chatRef)
  useEffect(() => {
    const restore = () => { setCurrent(resolveLocation(window.location.hash, admin)); setMobileNav(false) }
    window.addEventListener('hashchange', restore)
    return () => window.removeEventListener('hashchange', restore)
  }, [admin])
  useEffect(() => {
    if (!chatOpen) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setChatOpen(false) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [chatOpen])
  const logout = async () => {
    if (leaving) return
    setLeaving(true); setError('')
    try { await api('/logout', {}); onLogout() } catch (error) { setError(messageOf(error)) } finally { setLeaving(false) }
  }
  const choose = (next: WorkspaceLocation, focus = false) => {
    const valid = resolveLocation(locationHash(next), admin)
    setCurrent(valid); setMobileNav(false); setError('')
    if (window.location.hash !== locationHash(valid)) window.location.hash = locationHash(valid)
    mainRef.current?.scrollTo({ top: 0 })
    mainRef.current?.closest<HTMLElement>('.family-workspace')?.scrollTo({ top: 0 })
    if (focus) requestAnimationFrame(() => document.getElementById('family-page-title')?.focus({ preventScroll: true }))
  }
  const module = workspaceModules.find(item => item.id === current.module)
  const subpage = module?.pages.find(item => item.id === current.page) ?? module?.pages[0]
  const sections = module && subpage ? pageSections(module.id, subpage.id) : []
  const section = sections.find(item => item.id === current.section)
  useEffect(() => {
    const canonical = locationHash(current)
    if (window.location.hash && window.location.hash !== canonical) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${canonical}`)
  }, [current])
  const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).format(new Date())
  return <div className="family-theme family-workspace">
    <a className="family-skip" href="#family-page-title" onClick={event => { event.preventDefault(); document.getElementById('family-page-title')?.focus() }}>跳到主要内容</a>
    <header className="family-mobile-header">
      <HohoButton variant="ghost" size="icon" aria-label={mobileNav ? '关闭导航' : '打开导航'} aria-expanded={mobileNav} aria-controls="family-nav" onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X/> : <Menu/>}</HohoButton>
      <span>家庭统筹会</span>
      <HohoButton variant="ghost" size="icon" aria-label="打开生活助手" aria-expanded={chatOpen} onClick={() => setChatOpen(true)}><PanelRight/></HohoButton>
    </header>
    <aside className={`family-sidebar ${mobileNav ? 'is-open' : ''}`} id="family-nav">
      <div className="family-wordmark"><Home size={20} aria-hidden="true"/>家庭统筹会</div>
      <p className="hoho-text-caption">RAY / FAMILY WORKSPACE</p>
      <nav aria-label="家庭空间导航">
        <button type="button" aria-current={current.module === 'overview' ? 'page' : undefined} onClick={() => choose(defaultLocation, true)}><Home size={17} aria-hidden="true"/><span>我的空间</span></button>
        <span className="family-nav-label">家庭管理</span>
        {workspaceModules.map(item => {
          const Icon = moduleIcons[item.id]
          return <button key={item.id} type="button" aria-label={item.title} aria-current={current.module === item.id ? 'page' : undefined} onClick={() => choose({ module: item.id, page: item.pages[0].id }, true)}><Icon size={17} aria-hidden="true"/><span>{item.title}</span></button>
        })}
      </nav>
      <div className="family-sidebar-foot">
        {admin && <button type="button" className="family-access-link" aria-current={current.module === 'access' ? 'page' : undefined} onClick={() => choose({ module: 'access', page: 'overview' }, true)}><Users size={17} aria-hidden="true"/>家人访问管理</button>}
        <p><ShieldCheck size={15} aria-hidden="true"/>{session.name} · {admin ? '管理员' : '家庭成员'}</p>
        <HohoButton fullWidth size="small" variant="secondary" loading={leaving} onClick={() => void logout()}><LogOut size={15} aria-hidden="true"/>退出登录</HohoButton>
      </div>
    </aside>
    <div className={`family-main${module ? ' has-secondary' : ''}${sections.length ? ' has-tertiary' : ''}`}>
      <div className="family-topbar"><GlobalSearch choose={choose}/><HohoButton className="family-assistant-trigger" variant="secondary" onClick={() => setChatOpen(true)}><PanelRight size={17} aria-hidden="true"/>生活助手</HohoButton><span className="family-topbar-state"><LockKeyhole size={13} aria-hidden="true"/>已授权</span></div>
      {module && subpage && <DirectoryNavigation level={2} title={module.title} items={module.pages.map(item => ({ id: item.id, title: item.title, location: { module: module.id, page: item.id } }))} activeId={subpage.id} choose={choose}/>}
      {module && subpage && section && <DirectoryNavigation level={3} title={subpage.title} items={sections.map(item => ({ id: item.id, title: item.title, location: { module: module.id, page: subpage.id, section: item.id } }))} activeId={section.id} choose={choose}/>}
      <main className="family-content" ref={mainRef}>
        <div className="family-topline"><span>我的空间{module && <> / {module.title} / {subpage?.title}{section && ` / ${section.title}`}</>}{current.module === 'access' && ' / 家人访问管理'}</span><span>{date}</span></div>
        {error && <StatusNotice tone="error" title="操作未完成">{error}</StatusNotice>}
        <div className="family-page-body">{current.module === 'access' && admin ? <AccessManager onUnauthorized={onLogout}/> : module && subpage ? <ModuleContent module={module} pageId={subpage.id} sectionId={section?.id} choose={choose} admin={admin} onUnauthorized={onLogout}/> : <WorkspaceOverview name={session.name} admin={admin} choose={choose}/>}</div>
        <footer className="family-page-footer"><span>家庭统筹会 / Ray 家庭空间</span><span>财务透视表已开启 · AI 尚未开启</span></footer>
      </main>
    </div>
    {chatOpen && <div className="family-assistant-layer"><button className="family-assistant-backdrop" type="button" aria-label="关闭生活助手" onClick={() => setChatOpen(false)}/><aside ref={chatRef} className="family-assistant" role="dialog" aria-modal="true" aria-labelledby="family-assistant-title" tabIndex={-1}>
      <div className="family-chat-title"><h2 id="family-assistant-title" className="hoho-text-section-title">生活助手</h2><HohoButton variant="ghost" size="icon" aria-label="关闭聊天区域" onClick={() => setChatOpen(false)}><X size={18}/></HohoButton></div>
      <p className="family-assistant-status">AI 尚未开启 / 仅保留消息草稿</p>
      <p className="hoho-text-body-small">整理家庭事务、查找信息和安排计划。</p>
      <div className="family-prompts">{['整理这个月的家庭收支','列出本周需要处理的家庭事务','准备下一次家庭会议议题'].map(text => <HohoButton key={text} variant="secondary" fullWidth onClick={() => setDraft(text)}>{text}<ChevronRight size={14}/></HohoButton>)}</div>
      <label className="family-draft"><span className="hoho-text-label">消息草稿</span><textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} placeholder="输入需要整理的家庭事务…" rows={6}/></label>
      <p className="hoho-text-caption">当前内容不会发送给 AI。</p>
    </aside></div>}
  </div>
}

function GlobalSearch({ choose }: { choose: (location: WorkspaceLocation, focus?: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const results = searchWorkspace(query)
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('[role="dialog"][aria-modal="true"]')) { event.preventDefault(); field.current?.focus(); setOpen(true) }
    }
    const outside = (event: PointerEvent) => { if (!area.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('keydown', shortcut)
    document.addEventListener('pointerdown', outside)
    return () => { window.removeEventListener('keydown', shortcut); document.removeEventListener('pointerdown', outside) }
  }, [])
  const select = (location: WorkspaceLocation) => { setOpen(false); setQuery(''); choose(location, true) }
  return <div className="family-search" ref={area} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); field.current?.focus(); setOpen(false) }
  }}>
    <form role="search" aria-label="全局搜索" onSubmit={event => { event.preventDefault(); if (results[0]) select({ module: results[0].module.id, page: results[0].page.id, section: results[0].section?.id }) }}>
      <Search size={17} aria-hidden="true"/>
      <input ref={field} id="family-global-search" type="search" aria-label="全局搜索" autoComplete="off" placeholder="搜索全部模块、页面或关键词" value={query} aria-expanded={open} aria-controls={open ? 'family-search-results' : undefined} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true) }} onKeyDown={event => {
        if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); area.current?.querySelector<HTMLButtonElement>('.family-search-result')?.focus() }
      }}/>
      <kbd aria-hidden="true">⌘ / Ctrl K</kbd>
      {query && <button type="button" className="family-search-clear" aria-label="清空搜索" onClick={() => { setQuery(''); field.current?.focus() }}><X size={15}/></button>}
    </form>
    {open && <section className="family-search-results" id="family-search-results" aria-label="全局搜索结果">
      <div className="family-search-result-heading" aria-live="polite">{query.trim() ? `${results.length} 个匹配页面` : '搜索全部九大模块'}<button type="button" aria-label="关闭搜索结果" onClick={() => setOpen(false)}><X size={16}/></button></div>
      {!query.trim() ? <p className="family-search-empty">输入模块名称、页面或关键词，例如“预算”“房贷”“保姆”。</p> : !results.length ? <p className="family-search-empty" role="status">没有找到匹配的页面，请尝试其他关键词。</p> : <ul>{results.map(result => <li key={`${result.module.id}/${result.page.id}/${result.section?.id ?? ''}`}><button type="button" className="family-search-result" onClick={() => select({ module: result.module.id, page: result.page.id, section: result.section?.id })} onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const items = Array.from(area.current?.querySelectorAll<HTMLButtonElement>('.family-search-result') ?? [])
        const next = items.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1)
        if (next < 0) field.current?.focus(); else items[next % items.length]?.focus()
      }}><span><strong>{result.section?.title ?? result.page.title}</strong><small>{result.module.title} / {result.section ? `${result.page.title} / ${result.section.description}` : result.page.description}</small></span><ArrowUpRight size={15} aria-hidden="true"/></button></li>)}</ul>}
      <p className="family-search-scope">当前检索范围：全部模块、二级页面与三级目录。</p>
    </section>}
  </div>
}

function WorkspaceOverview({ name, admin, choose }: { name: string; admin: boolean; choose: (location: WorkspaceLocation, focus?: boolean) => void }) {
  return <><header className="family-page-heading"><div><p className="hoho-text-caption">FAMILY WORKSPACE / 00</p><h1 id="family-page-title" tabIndex={-1} className="hoho-text-display">我的空间</h1><p>{name}，这里汇总家庭事务、资料与安排。</p></div>{admin && <HohoButton variant="secondary" onClick={() => choose({ module: 'access', page: 'overview' }, true)}><Users size={16} aria-hidden="true"/>管理家人权限</HohoButton>}</header>
    <section className="family-summary" aria-label="家庭概览">{[['本月收入','尚未录入'],['本月支出','尚未录入'],['家庭净资产','尚未录入'],['近期安排','尚未录入']].map(([title, hint]) => <div key={title}><span>{title}</span><strong>—</strong><small>{hint}</small></div>)}</section>
    <div className="family-section-heading"><h2 className="hoho-text-section-title">家庭管理目录</h2><span>09 个模块 / {workspaceModules.reduce((total, item) => total + item.pages.length, 0)} 个二级页面</span></div>
    <div className="family-module-directory">{workspaceModules.map((module, index) => <button key={module.id} type="button" onClick={() => choose({ module: module.id, page: module.pages[0].id }, true)}><span className="family-directory-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{module.title}</strong><small>{module.description}</small></span><span className="family-directory-count">{module.pages.length} 个页面</span><ChevronRight size={17} aria-hidden="true"/></button>)}</div>
    <p className="family-section-note">财务透视表已支持管理员录入、编辑与统计。其他家庭功能继续逐项接入。</p>
  </>
}

function DirectoryNavigation({ level, title, items, activeId, choose }: { level: 2 | 3; title: string; items: { id: string; title: string; location: WorkspaceLocation }[]; activeId: string; choose: (location: WorkspaceLocation, focus?: boolean) => void }) {
  const activeLink = useRef<HTMLAnchorElement>(null)
  useEffect(() => { activeLink.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [title, activeId])
  const levelLabel = level === 2 ? '二级' : '三级'
  return <aside className={`family-secondary-sidebar${level === 3 ? ' family-tertiary-sidebar' : ''}`} aria-label={`${levelLabel}目录`}>
    <div className="family-secondary-heading"><p className="hoho-text-caption">{levelLabel}目录</p><p className="hoho-text-label">{title}</p></div>
    <nav className="family-subnav" aria-label={`${title}${levelLabel}菜单`}>{items.map(item => <a key={item.id} ref={item.id === activeId ? activeLink : undefined} href={locationHash(item.location)} aria-current={item.id === activeId ? 'page' : undefined} onClick={event => { event.preventDefault(); choose(item.location, true) }}>{item.title}</a>)}</nav>
  </aside>
}

function ModuleContent({ module, pageId, sectionId, choose, admin, onUnauthorized }: { module: WorkspaceModule; pageId: string; sectionId?: FinanceView; choose: (location: WorkspaceLocation) => void; admin: boolean; onUnauthorized: () => void }) {
  const current = module.pages.find(item => item.id === pageId) ?? module.pages[0]
  const index = workspaceModules.findIndex(item => item.id === module.id) + 1
  const financeView = sectionId ?? financeDefaultView(module.id, pageId)
  if (financeView) return <><header className="family-page-heading"><div><p className="hoho-text-caption">FAMILY MANAGEMENT / {String(index).padStart(2, '0')}</p><h1 id="family-page-title" tabIndex={-1} className="hoho-text-display">{module.title}</h1><p>{current.description}</p></div></header><FamilyFinance admin={admin} onUnauthorized={onUnauthorized} view={financeView} assetCategory={module.id === 'assets' ? ({ holdings: 'investment', equity: 'equity' } as Record<string,string>)[pageId] : undefined} debtOnly={module.id === 'assets' && pageId === 'liabilities'}/></>
  const metrics = module.id === 'finances' ? ['本月收入', '本月支出', '收支结余', '预算使用'] : module.id === 'assets' ? ['资产总额', '负债总额', '家庭净资产', '可用流动资金'] : []
  return <><header className="family-page-heading"><div><p className="hoho-text-caption">FAMILY MANAGEMENT / {String(index).padStart(2, '0')}</p><h1 id="family-page-title" tabIndex={-1} className="hoho-text-display">{module.title}</h1><p>{module.description}</p></div></header>
    <section className="family-page-section" aria-labelledby="family-subpage-title"><div className="family-section-heading"><h2 id="family-subpage-title" className="hoho-text-section-title">{current.title}</h2><span>页面框架</span></div><p className="family-subpage-description">{current.description}</p>
      {current.id === 'overview' ? <>{Boolean(metrics.length) && <section className="family-summary" aria-label={`${module.title}概览`}>{metrics.map(title => <div key={title}><span>{title}</span><strong>—</strong><small>等待录入</small></div>)}</section>}<div className="family-page-directory">{module.pages.slice(1).map(item => <button key={item.id} type="button" onClick={() => choose({ module: module.id, page: item.id })}><span><strong>{item.title}</strong><small>{item.description}</small></span><ChevronRight size={17} aria-hidden="true"/></button>)}</div></> : <>{module.id === 'schedule' && current.id === 'calendar' ? <SimpleCalendar/> : <div className="family-table-scroll" tabIndex={0} role="region" aria-label={`${current.title}记录表`}><table className="family-record-table"><caption className="sr-only">{current.title}，记录功能待开启</caption><thead><tr>{current.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody><tr><td colSpan={current.columns.length}><div className="family-table-empty"><strong>暂无记录</strong><span>页面结构已建立，记录与编辑功能待开启。</span></div></td></tr></tbody></table></div>}</>}
      <p className="family-section-note">本页为管理框架，尚未接入数据录入和自动统计。</p>
    </section>
  </>
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
  return <><header className="family-page-heading"><p className="hoho-text-caption">管理员专用</p><h1 id="family-page-title" tabIndex={-1} className="hoho-text-display">家人访问管理</h1><p>给每位家人一个登录码，有效 30 天，可随时撤销。</p></header><HealthCard className="family-access-create"><h2 className="hoho-text-section-title">生成家人登录码</h2><form onSubmit={event => void create(event)}><HohoInput id="family-label" label="家人称呼" placeholder="例如：妈妈、爸爸" value={label} onChange={event => setLabel(event.target.value)} maxLength={30} required disabled={busy}/><HohoButton type="submit" loading={busy} disabled={!label.trim()}>生成 30 天登录码</HohoButton></form>{generated && <div className="family-generated" role="status"><h3 className="hoho-text-card-title">{generated.label}的登录码已生成</h3><label className="hoho-text-label" htmlFor="generated-family-code">登录码（仅本次显示）</label><input className="hoho-input" id="generated-family-code" readOnly value={generated.loginCode} onFocus={event => event.target.select()}/><p>有效期至 {dateTime(generated.expiresAt)}（北京时间）</p><HohoButton variant="secondary" onClick={() => void copy()}>{copied ? <Check size={16}/> : <Clipboard size={16}/>} {copied ? '已复制链接和登录码' : '复制链接和登录码'}</HohoButton><p className="hoho-text-caption">复制后由你发给家人。离开页面后不会再次显示完整登录码；遗失时可撤销后重新生成。</p></div>}</HealthCard>{error && <StatusNotice tone="error" title="操作未完成" action={!codes ? <HohoButton variant="secondary" onClick={() => void reload()}>重试</HohoButton> : undefined}>{error}</StatusNotice>}<section className="family-access-list"><h2 className="hoho-text-section-title">家人访问权限</h2>{!codes ? <p role="status">正在读取登录码…</p> : !codes.length ? <EmptyState icon={<Users size={30}/>} title="还没有家人登录码" description="生成后，家人就可以用登录码进入，无需注册账号。"/> : <ul>{codes.map(code => <li key={code.id}><div><strong>{code.label}</strong><span>{code.status === 'active' ? `有效至 ${dateTime(code.expiresAt)}` : code.status === 'expired' ? '已到期' : '已撤销'}</span>{code.lastUsedAt && <small>最近登录 {dateTime(code.lastUsedAt)}</small>}</div>{code.status === 'active' && <HohoButton variant="text" disabled={busy} onClick={() => setRevoke(code)}>撤销</HohoButton>}</li>)}</ul>}</section><ConfirmDialog open={Boolean(revoke)} title={`撤销${revoke?.label ?? ''}的登录码？`} description="撤销后，使用这个登录码的设备也会退出家庭空间。需要时可以重新生成。" confirmLabel="确认撤销" danger loading={busy} onCancel={() => setRevoke(undefined)} onConfirm={() => void revokeCode()}/></>
}
