import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Camera, Check, Clock3, ExternalLink, Eye, History, ImageOff, LogIn, Plus, RefreshCw, Settings2, ShieldCheck, Upload, WalletCards, X } from 'lucide-react'
import { HohoButton } from '../../components/design-system/HohoButton'
import { useAppStore } from '../../store/useAppStore'
import {
  createBillingSource, getBillingHistory, getBillingSnapshotImage, getBillingSources, refreshAllBillingSources,
  refreshBillingSource, updateBillingSnapshot, updateBillingSource, uploadBillingSnapshot,
  type BillingFrequency, type BillingMethod, type BillingOverview, type BillingSnapshot, type BillingSource, type BillingSourceInput, type BillingStatus
} from '../../services/ops'
import './ops.css'

const statusMap: Record<BillingStatus, { label: string; detail: string; tone: string }> = {
  success: { label: '更新成功', detail: '当前显示最新成功快照', tone: 'success' },
  updating: { label: '正在更新', detail: '正在读取费用页面', tone: 'working' },
  relogin: { label: '需要重新登录', detail: '已停止自动任务并保留旧快照', tone: 'warning' },
  manual: { label: '需要手动更新', detail: '请从原平台上传最新截图', tone: 'warning' },
  failed: { label: '更新失败', detail: '已保留上一张成功快照', tone: 'error' },
  unconfigured: { label: '尚未配置', detail: '采集方式已选，连接器尚未接入', tone: 'neutral' }
}
const methodMap: Record<BillingMethod, string> = { api: '官方 API', 'automatic-screenshot': '自动截图', 'manual-screenshot': '手动截图' }
const frequencyMap: Record<BillingFrequency, string> = { daily: '每天', weekly: '每周', manual: '仅手动' }
const emptyOverview: BillingOverview = { total: 0, updatedToday: 0, relogin: 0, failed: 0 }
const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '尚无成功记录'
const stale = (source: BillingSource) => Boolean(source.latestSnapshot && source.lastAttemptAt && source.lastSuccessAt && source.lastAttemptAt > source.lastSuccessAt && source.status !== 'success')

export function OpsPage() {
  const token = useAppStore((state) => state.authToken)!
  const [sources, setSources] = useState<BillingSource[]>([])
  const [inactiveSources, setInactiveSources] = useState<string[]>([])
  const [overview, setOverview] = useState(emptyOverview)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [managing, setManaging] = useState<BillingSource | null>(null)
  const [uploading, setUploading] = useState<BillingSource | null>(null)
  const [large, setLarge] = useState<BillingSource | null>(null)

  const load = async (signal?: AbortSignal) => {
    const data = await getBillingSources(token, signal)
    setSources(data.sources); setInactiveSources(data.inactiveSources); setOverview(data.summary)
  }
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [token])

  const refreshAll = async () => {
    setRefreshingAll(true); setError('')
    try { const data = await refreshAllBillingSources(token); setSources(data.sources); setInactiveSources(data.inactiveSources); setOverview(data.summary) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '更新失败') }
    finally { setRefreshingAll(false) }
  }
  const refreshOne = async (source: BillingSource) => {
    setRefreshingId(source.id); setError('')
    try { const updated = await refreshBillingSource(token, source.id); setSources((all) => all.map((item) => item.id === updated.id ? updated : item)); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '更新失败') }
    finally { setRefreshingId(null) }
  }
  const replace = (updated: BillingSource) => { setSources((all) => all.map((item) => item.id === updated.id ? updated : item)); load().catch(() => undefined) }

  return <main className="ops-page">
    <header className="ops-topbar">
      <div className="ops-heading"><span><WalletCards size={17} />内部只读费用工作台</span><h1>Hoooho · 费用总控台</h1><p>集中查看各个平台的余额、用量、套餐与续费信息</p></div>
      <div className="ops-actions">
        <Link className="hoho-button" data-size="medium" data-variant="secondary" to="/ops/feedback">反馈管理</Link>
        <HohoButton variant="secondary" onClick={() => setCreating(true)}><Plus size={16} />新增费用来源</HohoButton>
        <HohoButton loading={refreshingAll} onClick={refreshAll}><RefreshCw size={16} />立即更新全部</HohoButton>
      </div>
    </header>

    <div className="ops-security-note"><ShieldCheck size={18} /><span><strong>仅管理员可见</strong> 快照通过已授权接口读取，不生成公开图片链接；自动任务不会绕过验证码、MFA 或 CAPTCHA。</span></div>
    {error && <div className="ops-error" role="alert"><AlertTriangle size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误"><X size={16} /></button></div>}

    <section className="ops-summary" aria-label="更新概览">
      <Summary label="费用来源总数" value={loading ? '—' : String(overview.total)} detail="已启用的快照来源" />
      <Summary label="今日已更新" value={loading ? '—' : String(overview.updatedToday)} detail="今天有成功快照" tone="success" />
      <Summary label="需要重新登录" value={loading ? '—' : String(overview.relogin)} detail="自动任务已暂停" tone={overview.relogin ? 'warning' : undefined} />
      <Summary label="更新失败" value={loading ? '—' : String(overview.failed)} detail="仍保留最近成功快照" tone={overview.failed ? 'error' : undefined} />
    </section>

    <section className="ops-sources-section">
      <div className="ops-section-heading"><div><span>Latest snapshots</span><h2>费用来源快照</h2><p>页面只展示最近一次成功截图；失败记录不会覆盖已有快照。</p></div><p><Clock3 size={15} />自动任务每日 08:00 按服务器时区串行执行</p></div>
      {loading ? <LoadingGrid /> : <div className="ops-source-grid">{sources.map((source) => <SourceCard key={source.id} source={source} token={token} refreshing={refreshingId === source.id} onRefresh={() => refreshOne(source)} onManage={() => setManaging(source)} onUpload={() => setUploading(source)} onLarge={() => setLarge(source)} />)}</div>}
    </section>

    <section className="ops-inactive"><div><h2>暂不采集</h2><p>尚未启用的平台保留为普通文字，不创建截图任务。</p></div><ul>{inactiveSources.map((item) => <li key={item}>{item}</li>)}</ul></section>

    {creating && <SourceDrawer title="新增费用来源" submitLabel="新增来源" onClose={() => setCreating(false)} onSubmit={async (values) => { const created = await createBillingSource(token, values); setSources((all) => [...all, created]); setCreating(false); await load() }} />}
    {managing && <ManageDrawer source={managing} token={token} onClose={() => setManaging(null)} onSaved={(updated) => { replace(updated); setManaging(updated) }} />}
    {uploading && <UploadDrawer source={uploading} token={token} onClose={() => setUploading(null)} onUploaded={(updated) => { replace(updated); setUploading(null) }} />}
    {large && large.latestSnapshot && <SnapshotModal source={large} token={token} onClose={() => setLarge(null)} />}
  </main>
}

function Summary({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <article data-tone={tone}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function SourceCard({ source, token, refreshing, onRefresh, onManage, onUpload, onLarge }: { source: BillingSource; token: string; refreshing: boolean; onRefresh: () => void; onManage: () => void; onUpload: () => void; onLarge: () => void }) {
  const snapshot = useSnapshotUrl(token, source.id, source.latestSnapshot?.id ?? null)
  const state = statusMap[source.status]
  return <article className="ops-source-card">
    <header>
      <div className="ops-source-identity"><span className="ops-source-icon" aria-hidden="true">{source.icon}</span><div><h3>{source.name}</h3><p>{methodMap[source.method]} · {frequencyMap[source.frequency]}</p></div></div>
      <span className="ops-status" data-tone={state.tone}>{source.status === 'updating' ? <RefreshCw className="ops-spin" /> : source.status === 'success' ? <Check /> : source.status === 'relogin' ? <LogIn /> : <Clock3 />}{state.label}</span>
    </header>
    <div className="ops-source-meta"><span>最近成功更新</span><strong>{formatTime(source.lastSuccessAt)}</strong></div>
    {stale(source) && <div className="ops-stale"><AlertTriangle size={15} />最新更新失败，当前显示的是 {formatTime(source.lastSuccessAt)} 快照</div>}
    <button className="ops-snapshot" onClick={source.latestSnapshot ? onLarge : onUpload} aria-label={source.latestSnapshot ? `查看 ${source.name} 快照大图` : `为 ${source.name} 上传截图`}>
      {snapshot.loading ? <div className="ops-snapshot-state"><RefreshCw className="ops-spin" /><span>正在安全读取快照</span></div> : snapshot.url ? <img src={snapshot.url} alt={`${source.name} 最新费用页面快照`} /> : <div className="ops-snapshot-state"><ImageOff /><strong>尚无页面快照</strong><span>{source.method === 'manual-screenshot' ? '上传一张已裁除隐私信息的截图' : '配置连接器，或先手动上传截图'}</span></div>}
    </button>
    {snapshot.error && <p className="ops-image-error">{snapshot.error}</p>}
    <footer>
      <button onClick={source.latestSnapshot ? onLarge : onUpload}>{source.latestSnapshot ? <><Eye size={15} />查看大图</> : <><Upload size={15} />上传截图</>}</button>
      <a href={source.platformUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />打开原平台</a>
      <button onClick={source.method === 'manual-screenshot' ? onUpload : onRefresh} disabled={refreshing}>{source.method === 'manual-screenshot' ? <Upload size={15} /> : <RefreshCw className={refreshing ? 'ops-spin' : ''} size={15} />}{source.method === 'manual-screenshot' ? '手动更新' : refreshing ? '更新中' : source.status === 'relogin' ? '重新验证并更新' : '立即更新'}</button>
      <button onClick={onManage}><Settings2 size={15} />管理</button>
    </footer>
  </article>
}

function useSnapshotUrl(token: string, sourceId: string, snapshotId: string | null) {
  const [url, setUrl] = useState<string | null>(null), [loading, setLoading] = useState(Boolean(snapshotId)), [error, setError] = useState('')
  useEffect(() => {
    if (!snapshotId) { setUrl(null); setLoading(false); setError(''); return }
    const controller = new AbortController(); let objectUrl = ''
    setLoading(true); setError('')
    getBillingSnapshotImage(token, sourceId, snapshotId, controller.signal).then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }).catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) }).finally(() => setLoading(false))
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [token, sourceId, snapshotId])
  return { url, loading, error }
}

function LoadingGrid() { return <div className="ops-source-grid" aria-label="正在读取费用来源">{Array.from({ length: 6 }, (_, index) => <div className="ops-source-card ops-source-skeleton" key={index}><i /><i /><i /></div>)}</div> }

const defaultInput: BillingSourceInput = { name: '', icon: '', platformUrl: '', method: 'manual-screenshot', frequency: 'manual', notes: '', loginUrl: '', targetDescription: '', targetSelector: '', waitCondition: '', enabled: true }

function SourceDrawer({ title, submitLabel, source, onClose, onSubmit }: { title: string; submitLabel: string; source?: BillingSource; onClose: () => void; onSubmit: (values: BillingSourceInput) => Promise<void> }) {
  const [form, setForm] = useState<BillingSourceInput>(source ? { name: source.name, icon: source.icon, platformUrl: source.platformUrl, method: source.method, frequency: source.frequency, notes: source.notes, loginUrl: source.loginUrl, targetDescription: source.targetDescription, targetSelector: source.targetSelector, waitCondition: source.waitCondition, enabled: source.enabled } : defaultInput)
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const field = <K extends keyof BillingSourceInput>(key: K, value: BillingSourceInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { await onSubmit(form) } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') } finally { setSaving(false) } }
  return <Drawer title={title} subtitle="凭据只允许存放在服务器端安全配置中，不在这里填写密码、Cookie 或 Token。" onClose={onClose}>
    <form onSubmit={submit}><div className="ops-form-grid">
      <Field label="平台名称"><input required maxLength={120} value={form.name} onChange={(event) => field('name', event.target.value)} /></Field>
      <Field label="平台图标缩写"><input maxLength={8} placeholder="例如 RW" value={form.icon} onChange={(event) => field('icon', event.target.value)} /></Field>
      <Field wide label="原平台费用页面地址"><input required type="url" placeholder="https://" value={form.platformUrl} onChange={(event) => field('platformUrl', event.target.value)} /></Field>
      <Field label="更新方式"><select value={form.method} onChange={(event) => field('method', event.target.value as BillingMethod)}>{Object.entries(methodMap).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="更新频率"><select value={form.frequency} onChange={(event) => field('frequency', event.target.value as BillingFrequency)}>{Object.entries(frequencyMap).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      {form.method === 'automatic-screenshot' && <><Field wide label="登录页面地址（可选）"><input type="url" placeholder="https://" value={form.loginUrl ?? ''} onChange={(event) => field('loginUrl', event.target.value)} /></Field><Field wide label="截图目标区域说明"><textarea placeholder="例如：账单页中的余额、用量与套餐区域" value={form.targetDescription ?? ''} onChange={(event) => field('targetDescription', event.target.value)} /></Field><Field label="目标区域选择器（可选）"><input value={form.targetSelector ?? ''} onChange={(event) => field('targetSelector', event.target.value)} /></Field><Field label="页面加载等待条件（可选）"><input value={form.waitCondition ?? ''} onChange={(event) => field('waitCondition', event.target.value)} /></Field></>}
      <Field wide label="备注"><textarea value={form.notes} onChange={(event) => field('notes', event.target.value)} /></Field>
    </div>{error && <p className="ops-form-error">{error}</p>}<DrawerFooter saving={saving} onClose={onClose} submitLabel={submitLabel} /></form>
  </Drawer>
}

function ManageDrawer({ source, token, onClose, onSaved }: { source: BillingSource; token: string; onClose: () => void; onSaved: (source: BillingSource) => void }) {
  const [history, setHistory] = useState<BillingSnapshot[]>([]), [historyError, setHistoryError] = useState('')
  useEffect(() => { getBillingHistory(token, source.id).then((data) => setHistory(data.snapshots)).catch((cause) => setHistoryError(cause.message)) }, [token, source.id])
  const toggleImportant = async (snapshot: BillingSnapshot) => { const updated = await updateBillingSnapshot(token, source.id, snapshot.id, !snapshot.important); setHistory((all) => all.map((item) => item.id === updated.id ? updated : item)) }
  return <Drawer title="管理费用来源" subtitle={source.name} onClose={onClose}>
    <SourceDrawerContent source={source} onSubmit={async (values) => onSaved(await updateBillingSource(token, source.id, values))} onClose={onClose} />
    <section className="ops-history"><div><History size={18} /><span><h3>最近 30 天快照</h3><p>重要记录不会自动清理</p></span></div>{historyError && <p className="ops-form-error">{historyError}</p>}{history.length === 0 ? <p className="ops-history-empty">尚无快照记录。</p> : <ul>{history.map((snapshot) => <li key={snapshot.id} data-result={snapshot.result}><span><strong>{formatTime(snapshot.createdAt)}</strong><small>{methodMap[snapshot.method]} · {snapshot.result === 'success' ? '成功' : snapshot.failureReason}</small></span><button onClick={() => toggleImportant(snapshot)} aria-pressed={snapshot.important}>{snapshot.important ? '已标记重要' : '标记为重要'}</button></li>)}</ul>}</section>
  </Drawer>
}

function SourceDrawerContent({ source, onSubmit, onClose }: { source: BillingSource; onSubmit: (values: BillingSourceInput) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<BillingSourceInput>({ name: source.name, icon: source.icon, platformUrl: source.platformUrl, method: source.method, frequency: source.frequency, notes: source.notes, loginUrl: source.loginUrl, targetDescription: source.targetDescription, targetSelector: source.targetSelector, waitCondition: source.waitCondition, enabled: source.enabled })
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const field = <K extends keyof BillingSourceInput>(key: K, value: BillingSourceInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { await onSubmit(form) } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') } finally { setSaving(false) } }
  return <form onSubmit={submit}><div className="ops-form-grid">
    <Field label="平台名称"><input required value={form.name} onChange={(event) => field('name', event.target.value)} /></Field><Field label="图标缩写"><input maxLength={8} value={form.icon} onChange={(event) => field('icon', event.target.value)} /></Field>
    <Field wide label="原平台费用页面地址"><input required type="url" value={form.platformUrl} onChange={(event) => field('platformUrl', event.target.value)} /></Field><Field label="更新方式"><select value={form.method} onChange={(event) => field('method', event.target.value as BillingMethod)}>{Object.entries(methodMap).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="更新频率"><select value={form.frequency} onChange={(event) => field('frequency', event.target.value as BillingFrequency)}>{Object.entries(frequencyMap).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field wide label="截图目标区域说明"><textarea value={form.targetDescription ?? ''} onChange={(event) => field('targetDescription', event.target.value)} /></Field><Field wide label="备注"><textarea value={form.notes} onChange={(event) => field('notes', event.target.value)} /></Field>
  </div>{error && <p className="ops-form-error">{error}</p>}<DrawerFooter saving={saving} onClose={onClose} submitLabel="保存设置" /></form>
}

function UploadDrawer({ source, token, onClose, onUploaded }: { source: BillingSource; token: string; onClose: () => void; onUploaded: (source: BillingSource) => void }) {
  const [file, setFile] = useState<File | null>(null), [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!file || !confirmed) return
    setSaving(true); setError('')
    try { const dataUrl = await readFileAsDataUrl(file); onUploaded(await uploadBillingSnapshot(token, source.id, { name: file.name, type: file.type, dataUrl })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '上传失败') } finally { setSaving(false) }
  }
  return <Drawer title="上传最新截图" subtitle={source.name} onClose={onClose}><form onSubmit={submit} className="ops-upload-form"><div className="ops-upload-drop"><Upload /><strong>{file ? file.name : '选择费用页面截图'}</strong><span>JPG、PNG 或 WebP，单张不超过 12MB</span><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div><label className="ops-redaction-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>我已检查并裁除邮箱、姓名、银行卡、地址、API Key、Token、订单号等无关隐私信息。</span></label>{error && <p className="ops-form-error">{error}</p>}<DrawerFooter saving={saving} disabled={!file || !confirmed} onClose={onClose} submitLabel="保存为最新快照" /></form></Drawer>
}

function SnapshotModal({ source, token, onClose }: { source: BillingSource; token: string; onClose: () => void }) {
  const snapshot = useSnapshotUrl(token, source.id, source.latestSnapshot!.id)
  return <div className="ops-modal-layer" role="dialog" aria-modal="true" aria-label={`${source.name} 快照大图`}><button className="ops-modal-backdrop" onClick={onClose} aria-label="关闭大图" /><section className="ops-modal"><header><div><h2>{source.name}</h2><p>{formatTime(source.lastSuccessAt)} · {methodMap[source.latestSnapshot!.method]}</p></div><button onClick={onClose} aria-label="关闭"><X /></button></header><div>{snapshot.url ? <img src={snapshot.url} alt={`${source.name} 费用页面大图`} /> : <div className="ops-snapshot-state"><ImageOff /><span>{snapshot.error || '正在读取快照'}</span></div>}</div></section></div>
}

function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) { return <div className="ops-drawer-layer"><button className="ops-backdrop" onClick={onClose} aria-label="关闭" /><aside className="ops-drawer" role="dialog" aria-modal="true" aria-labelledby="ops-drawer-title"><header><div><h2 id="ops-drawer-title">{title}</h2><p>{subtitle}</p></div><button onClick={onClose} aria-label="关闭"><X /></button></header>{children}</aside></div> }
function DrawerFooter({ saving, disabled, onClose, submitLabel }: { saving: boolean; disabled?: boolean; onClose: () => void; submitLabel: string }) { return <footer className="ops-drawer-footer"><HohoButton type="button" variant="secondary" onClick={onClose}>取消</HohoButton><HohoButton type="submit" loading={saving} disabled={disabled}>{submitLabel}</HohoButton></footer> }
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={wide ? 'ops-field ops-field-wide' : 'ops-field'}><span>{label}</span>{children}</label> }
function readFileAsDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('无法读取截图')); reader.readAsDataURL(file) }) }
