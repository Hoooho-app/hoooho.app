import { useEffect, useRef, useState } from 'react'
import { opsApiRequest } from '../../services/opsAuth'
import { useAppStore } from '../../store/useAppStore'
import { HohoButton } from '../../components/design-system/HohoButton'
import { OpsProjectPicker, useOpsProject, projectName, useOpsInbox } from './workspace'

interface Service { probeKind?: 'page'; id: string; projectId: string; name: string; url: string | null; state: string; checkedAt: string | null; latencyMs: number | null; httpStatus: number | null }
interface Services { services: Service[]; providers: { name: string; projectId: string; configured: boolean }[]; checkedScope: string }
interface Release { projectId: string; channel: string; revision: string | null; deploymentId: string | null; startedAt: string; repository: string; status: string }
interface Versions { current: Release; releases: Release[]; native: { label: string } }
interface Reminders { noticeDays: number; warningDays: number; criticalDays: number; quotaWarningPercent: number; quotaCriticalPercent: number }
interface Settings { reminders: Reminders; schedule: { time: string; timeZone: string; catchUpOnRestart: boolean }; notification: string; capture: { connected: boolean; profilesConfigured: boolean; detail: string } }
const time = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '尚未检查'
function useResource<T>(path: string) {
  const token = useAppStore(s => s.opsAuthToken)!
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [iteration, setIteration] = useState(0)
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError('')
    opsApiRequest<T>(path, { token, signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value) }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [path, token, iteration])
  return { data, setData, error, loading, reload: () => setIteration(v => v + 1), token }
}
function Status({ state, children }: { state: string; children: React.ReactNode }) { return <span className="ops-module-status" data-state={state}>{children}</span> }
function PageHeader({ title, detail, reload, loading, project = true }: { title: string; detail: string; reload: () => void; loading: boolean; project?: boolean }) { return <><header className="ops-overview-heading"><div><h1>{title}</h1><p>{detail}</p></div><HohoButton variant="secondary" loading={loading} onClick={reload}>重新检查</HohoButton></header>{project && <div className="ops-module-projects"><OpsProjectPicker /></div>}</> }
function ErrorState({ text, retry }: { text: string; retry: () => void }) { return <div className="ops-error" role="alert">{text}<button type="button" onClick={retry}>重试</button></div> }
export function OpsServicesPage() {
  const resource = useResource<Services>('/api/ops/services'), { data, loading, error, reload } = resource
  const { project } = useOpsProject()
  const services = data?.services.filter(s => project === 'all' || s.projectId === project) ?? []
  const providers = data?.providers.filter(s => project === 'all' || s.projectId === project) ?? []
  return <main className="ops-module-page" aria-label="服务链接"><PageHeader title="服务链接" detail="应用连接情况与常用入口" reload={reload} loading={loading}/>{error && <ErrorState text={error} retry={reload}/>}
    <section className="ops-module-section"><h2>应用服务</h2><div className="ops-service-grid">{services.map(item => <article className="ops-module-card" key={item.id}><header><div><small>{projectName(item.projectId)}</small><h3>{item.name}</h3></div><Status state={item.state}>{item.probeKind === 'page' && item.state === 'online' ? '入口可访问' : ({ online: '在线', degraded: '检查异常', unreachable: '暂时无法连接', unconfigured: '尚未接入' })[item.state] ?? '未知'}</Status></header><dl><div><dt>{item.probeKind === 'page' ? '前端入口' : '健康检查'}</dt><dd>{item.httpStatus ? `HTTP ${item.httpStatus}` : '—'}</dd></div><div><dt>响应时间</dt><dd>{item.latencyMs === null ? '—' : `${item.latencyMs} ms`}</dd></div><div><dt>检查时间</dt><dd>{time(item.checkedAt)}</dd></div></dl>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">打开应用</a> : <p className="ops-module-muted">{item.state === 'unconfigured' ? '未登记服务地址，尚不判断在线状态。' : '内部服务地址不公开，检查结果如上。'}</p>}</article>)}</div></section>
    {providers.length > 0 && <section className="ops-module-section"><h2>接口配置</h2>{providers.map(item => <div className="ops-module-row" key={item.name}><strong>{item.name}</strong><Status state="unknown">{item.configured ? '服务端已配置' : '尚未配置'}</Status></div>)}<p className="ops-module-muted">{data?.checkedScope}</p></section>}
    {!data && loading && <p role="status">正在检查连接…</p>}
  </main>
}
export function OpsVersionsPage() {
  const { data, error, loading, reload } = useResource<Versions>('/api/ops/versions'), { project } = useOpsProject()
  const current = data && (project === 'all' || project === data.current.projectId) ? data.current : null
  const releases = data?.releases.filter(r => project === 'all' || r.projectId === project) ?? []
  return <main className="ops-module-page" aria-label="版本管理"><PageHeader title="版本管理" detail="当前运行实例与发布回执" reload={reload} loading={loading}/>{error && <ErrorState text={error} retry={reload}/>}
    {current ? <section className="ops-module-section"><h2>当前版本</h2><article className="ops-module-card ops-current-release"><header><div><small>{projectName(current.projectId)} · {current.channel}</small><h3>{current.revision ? current.revision.slice(0, 8) : '提交信息暂未提供'}</h3></div><Status state="online">当前实例运行中</Status></header><dl><div><dt>进程启动</dt><dd>{time(current.startedAt)}</dd></div><div><dt>部署编号</dt><dd>{current.deploymentId ?? '平台未提供'}</dd></div><div><dt>代码提交</dt><dd>{current.revision ?? '未知，不使用仓库最新提交代替'}</dd></div></dl>{current.revision && <a href={`${current.repository}/commit/${current.revision}`} target="_blank" rel="noreferrer">查看本次代码</a>}</article></section> : !loading && <div className="ops-inbox-empty"><h2>该项目尚未接入版本回执</h2><p>不使用其他项目的提交作为当前版本。</p></div>}
    {current && <section className="ops-module-section"><h2>运行历史</h2>{releases.length ? releases.map(r => <div className="ops-module-row" key={`${r.revision}:${r.deploymentId}`}><strong>{r.revision?.slice(0, 8)}</strong><span>{r.channel}</span><time>{time(r.startedAt)}</time><a href={`${r.repository}/commit/${r.revision}`} target="_blank" rel="noreferrer">查看代码</a></div>) : <p className="ops-module-muted">尚无可验证的历史提交；之后仅记录本服务实际运行的版本。</p>}<p className="ops-module-muted">这里保留实例启动回执；回滚及审核发布仍在原平台执行。</p></section>}
    {(project === 'all' || project === 'hoooho') && data && <section className="ops-module-section"><h2>原生发布渠道</h2><p className="ops-module-muted">{data.native.label}</p></section>}
  </main>
}
export function OpsSettingsPage() {
  const { data, setData, error, loading, reload, token } = useResource<Settings>('/api/ops/settings')
  const [form, setForm] = useState<Reminders | null>(null), [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [saveError, setSaveError] = useState('')
  const dirty = useRef(false)
  const inbox = useOpsInbox()
  useEffect(() => { if (data && !dirty.current) setForm(data.reminders) }, [data])
  const fields: { key: keyof Reminders; label: string; unit: string }[] = [{ key: 'noticeDays', label: '提前提醒', unit: '天' }, { key: 'warningDays', label: '临近到期', unit: '天' }, { key: 'criticalDays', label: '紧急到期', unit: '天' }, { key: 'quotaWarningPercent', label: '额度不足', unit: '%' }, { key: 'quotaCriticalPercent', label: '额度将耗尽', unit: '%' }]
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (!form) return; setSaving(true); setMessage(''); setSaveError('')
    try { const result = await opsApiRequest<Settings>('/api/ops/settings', { token, method: 'PATCH', body: { reminders: form } }); dirty.current = false; setData(result); setForm(result.reminders); setMessage('设置已保存，费用状态与 Overview 将采用新阈值。'); void inbox?.refresh() } catch (e) { setSaveError(e instanceof Error ? e.message : '保存失败，已保留填写内容。') } finally { setSaving(false) }
  }
  return <main className="ops-module-page" aria-label="工作台设置"><PageHeader title="工作台设置" detail="自动采集与站内提醒规则" reload={reload} loading={loading} project={false}/>{error && <ErrorState text={error} retry={reload}/>}
    {data && <><section className="ops-module-section"><h2>自动采集</h2><div className="ops-module-row"><strong>每天 {data.schedule.time}</strong><span>{data.schedule.timeZone} · 重启后补采到期任务</span></div><div className="ops-module-row"><strong>账单浏览器</strong><Status state={data.capture.connected ? 'unknown' : 'unconfigured'}>{data.capture.connected ? '连接地址已配置，来源仍需逐项核验' : '等待持续登录授权'}</Status></div><p className="ops-module-muted">{data.capture.detail}</p><ol className="ops-connection-steps"><li>打开费用来源的“连接采集”，由本人完成一次平台登录。</li><li>在费用来源内连接采集，完成平台登录并核对读取字段与截图区域。</li><li>保存连接后立即读取一次；之后后台定时运行，验证码只在需要时由本人操作。</li></ol><p className="ops-module-muted">会话失效会提示重新登录；不会要求日常上传截图，也不会自动续费或付款。域名到期无需登录，使用官方注册数据。</p></section>
    <section className="ops-module-section"><h2>提醒阈值</h2><p className="ops-module-muted">适用于所有已接入来源。数据缺失或过期保持待核验；未知项不算正常。</p>{form && <form onSubmit={save} className="ops-settings-form">{fields.map(field => <label key={field.key}>{field.label}<span><input aria-label={field.label} type="number" min="0" max={field.unit === '%' ? 100 : 365} required disabled={saving} value={Number.isNaN(form[field.key]) ? '' : form[field.key]} onChange={e => { dirty.current = true; setForm({ ...form, [field.key]: e.target.value === '' ? NaN : Number(e.target.value) }); setMessage('') }}/>{field.unit}</span></label>)}<p className="ops-module-muted">日期按北京时间的自然日比较；额度用量周期结束不当作欠费。余额提醒值按平台币种在采集配置中设置。</p>{saveError && <p className="ops-form-error" role="alert">{saveError}</p>}{message && <p role="status">{message}</p>}<HohoButton type="submit" loading={saving}>保存提醒设置</HohoButton></form>}</section>
    <section className="ops-module-section"><h2>通知与权限</h2><p>{data.notification}</p><p className="ops-module-muted">仅当前唯一管理员可查看；截图保留在私有存储，已查看与已处理分别记录。</p></section></>}
  </main>
}
