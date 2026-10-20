import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Plus, Pencil, Trash2, X, RefreshCw, Download } from 'lucide-react'
import { HohoButton } from '../../components/design-system/HohoButton'
import { HohoInput } from '../../components/design-system/HohoInput'
import { ModalSurface } from '../../components/design-system/ModalSurface'
import { StatusNotice } from '../../components/design-system/StatusNotice'
import { ConfirmDialog } from '../../components/design-system/ConfirmDialog'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { api, FamilyApiError, messageOf } from './api'
import { assetCategories, debtCategories, flowKinds, flowPatterns, policyCategories, premiumPeriods, goalCategories, assetExpiry, financeSummary, availableAsset, activePolicy, annualPremium, chinaDate, type Asset, type FinanceSnapshot, type FinanceData } from '../../../shared/family-finance.mjs'
import { locationHash, type FinancePresentation, type WorkspaceLocation } from './navigation'
import { forecastMonths } from '../../../shared/family-finance-forecast.mjs'
import { AssetAttachments } from './asset-attachments'
import './finance.css'

type Collection = 'assets' | 'debts' | 'flows' | 'policies' | 'goals'
type Row = Record<string, string | number | boolean | null>
type Field = { key: string; label: string; type?: 'text' | 'money' | 'date' | 'month' | 'check' | 'note' | 'number'; options?: Record<string, string>; required?: boolean; hint?: string }
type Editor = { collection: Collection | 'settings'; row: Row; existing: boolean; flowMode?: 'actual' | 'budget' }

const names: Record<Collection | 'settings', string> = { assets: '资产', debts: '负债', flows: '月度项目', policies: '保单', goals: '资金目标', settings: '储备设置' }
const ownerField: Field = { key: 'owner', label: '归属成员', required: true, hint: '可填写家人称呼或“家庭共同”。' }
const noteField: Field = { key: 'note', label: '备注', type: 'note' }
const fields: Record<Collection | 'settings', Field[]> = {
  assets: [{ key: 'name', label: '资产名称', required: true }, { key: 'category', label: '资产类别', options: assetCategories }, ownerField, { key: 'amount', label: '当前余额或估值（元）', type: 'money', required: true }, { key: 'valuedAt', label: '估值日期', type: 'date', required: true }, { key: 'startDate', label: '取得 / 开卡日期', type: 'date' }, { key: 'endDatePrecision', label: '有效期精度', options: { day: '具体日期', month: '月份（银行卡月/年）' } }, { key: 'endDate', label: '有效期 / 到期日', type: 'date' }, { key: 'remindDays', label: '提前提示天数', type: 'number', hint: '在页面显示到期提示，0 表示只在到期当天提示。' }, { key: 'available', label: '随时可取的现金或存款', type: 'check', hint: '未到期、冻结、有限制的存款请勿勾选。' }, { key: 'emergency', label: '已指定用于家庭应急储备', type: 'check', hint: '仅统计上面勾选随时可取的现金或存款。' }, noteField],
  debts: [{ key: 'name', label: '负债名称', required: true }, { key: 'category', label: '负债类别', options: debtCategories }, ownerField, { key: 'balance', label: '剩余欠款（元）', type: 'money', required: true }, { key: 'apr', label: '年化利率（%）', type: 'money' }, { key: 'monthlyPayment', label: '每期应还金额（元）', type: 'money', hint: '可含本金与利息；仅作为还款信息，不自动记入收支。' }, { key: 'creditLimit', label: '授信额度（元，可不填）', type: 'money', hint: '仅供参考，不计入资产或现金储备。' }, { key: 'dueDate', label: '下次还款日', type: 'date' }, noteField],
  flows: [{ key: 'name', label: '项目名称', required: true }, { key: 'month', label: '所属月份', type: 'month', required: true }, { key: 'kind', label: '项目类型', options: flowKinds }, { key: 'pattern', label: '发生性质', options: flowPatterns }, { key: 'category', label: '收支分类', required: true, hint: '例如工资、居住、餐饮、交通、保险、借款利息。' }, ownerField, { key: 'budget', label: '计划金额（元）', type: 'money', hint: '留空表示尚未制定计划；0 表示计划为零。' }, { key: 'actual', label: '实际金额（元）', type: 'money', hint: '填当月累计实际金额；留空表示尚未核对。' }, { key: 'essential', label: '属于必要生活开支', type: 'check' }, noteField],
  policies: [{ key: 'name', label: '保单名称', required: true }, { key: 'category', label: '保险类型', options: policyCategories }, { key: 'insured', label: '被保人', required: true }, { ...ownerField, label: '缴费人' }, { key: 'insurer', label: '保险公司' }, { key: 'premium', label: '每期保费（元）', type: 'money', required: true }, { key: 'frequency', label: '缴费周期', options: premiumPeriods }, { key: 'coverage', label: '主保障保额（元）', type: 'money', hint: '不同责任、日津贴等请写在保障说明中，不相加。' }, { key: 'dueDate', label: '下次续费日', type: 'date' }, { key: 'endDate', label: '保障到期日', type: 'date' }, { key: 'status', label: '保单状态', options: { active: '有效', expired: '已到期', cancelled: '已终止' } }, { key: 'policyNumber', label: '保单编号（可选）' }, { ...noteField, label: '保障说明与备注', hint: '可记录保障责任、免赔额、理赔联系方式和资料位置。' }],
  goals: [{ key: 'name', label: '目标名称', required: true }, { key: 'category', label: '目标类型', options: goalCategories }, ownerField, { key: 'target', label: '目标金额（元）', type: 'money', required: true }, { key: 'funded', label: '已备金额（元）', type: 'money', required: true, hint: '用于跟踪进度，不重复加入资产总额。' }, { key: 'dueDate', label: '目标日期', type: 'date' }, noteField],
  settings: [{ key: 'essentialMonthly', label: '每月必要开支基线（元）', type: 'money', hint: '用于计算储备可支持月数。请按家庭实际需要填写，留空则不计算。' }, { key: 'reserveMonths', label: '储备目标月数', type: 'number', required: true, hint: '由家庭自行设定，范围 1–120 个月。' }]
}
const money = (amount: number | null | undefined) => amount == null ? '—' : `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const percent = (amount: number | null) => amount === null ? '—' : `${(amount * 100).toFixed(1)}%`
const updated = (time: number | null) => time ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(time) : '尚未录入'
const hasData = (data: FinanceData) => [data.assets, data.debts, data.flows, data.policies, data.goals].some(rows => rows.length)

function newRow(collection: Collection, month: string): Row {
  const common = { id: crypto.randomUUID(), name: '', owner: '家庭共同', note: '' }
  if (collection === 'assets') return { ...common, category: 'cash', amount: null, valuedAt: chinaDate(), startDate: '', endDate: '', endDatePrecision: 'day', remindDays: 30, available: true, emergency: false }
  if (collection === 'debts') return { ...common, category: 'mortgage', balance: null, apr: null, monthlyPayment: null, creditLimit: null, dueDate: '' }
  if (collection === 'flows') return { ...common, month, kind: 'expense', pattern: 'variable', category: '', budget: null, actual: null, essential: false }
  if (collection === 'policies') return { ...common, category: 'medical', insured: '', insurer: '', premium: null, frequency: 'annual', coverage: null, dueDate: '', endDate: '', status: 'active', policyNumber: '' }
  return { ...common, category: 'education', target: null, funded: 0, dueDate: '' }
}

export function FamilyFinance({ admin, onUnauthorized, view = 'overview', balancePart, assetCategories: assetScope, debtCategories: debtScope, flowMode = 'budget', flowPattern, flowKinds: flowScope, title, onNavigate }: FinancePresentation & { admin: boolean; onUnauthorized: () => void; title: string; onNavigate: (location: WorkspaceLocation) => void }) {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot>()
  const [month, setMonth] = useState(chinaDate().slice(0, 7))
  const [owner, setOwner] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<Editor>()
  const [removing, setRemoving] = useState<{ collection: Collection; row: Row }>()
  const [busy, setBusy] = useState(false)
  const [mutationError, setMutationError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  const unauthorized = useRef(onUnauthorized); unauthorized.current = onUnauthorized
  useEffect(() => { setNotice('') }, [view])
  const fail = (cause: unknown) => { if (cause instanceof FamilyApiError && cause.status === 401) unauthorized.current(); return messageOf(cause) }
  const load = async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try { const next = await api<FinanceSnapshot>('/finance', undefined, signal); if (!signal?.aborted && mounted.current) setSnapshot(next) }
    catch (cause) { if (!signal?.aborted && mounted.current) setError(fail(cause)) }
    finally { if (!signal?.aborted && mounted.current) setLoading(false) }
  }
  useEffect(() => { mounted.current = true; const controller = new AbortController(); void load(controller.signal); return () => { mounted.current = false; controller.abort() } }, [])
  const persist = async (data: FinanceData, success: string) => {
    if (!snapshot || pending.current) return
    pending.current = true; setBusy(true); setMutationError(''); setNotice('')
    try {
      const next = await api<FinanceSnapshot>('/finance', { revision: snapshot.revision, data })
      if (mounted.current) { setSnapshot(next); setEditor(undefined); setRemoving(undefined); setNotice(success); setError('') }
    } catch (cause) { if (mounted.current) setMutationError(fail(cause)) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  const open = (collection: Collection, row?: Row) => { setMutationError(''); setEditor({ collection, row: row ? { ...(collection === 'assets' ? { startDate: '', endDate: '', endDatePrecision: 'day', remindDays: 30 } : {}), ...row } : { ...newRow(collection, month), ...(collection === 'assets' && assetScope?.length === 1 ? { category: assetScope[0], available: ['cash', 'deposit'].includes(assetScope[0]) } : {}), ...(collection === 'flows' && flowPattern ? { pattern: flowPattern } : {}), ...(collection === 'flows' && flowScope ? { kind: flowScope.includes('expense') ? 'expense' : flowScope[0] } : {}) }, existing: Boolean(row), ...(collection === 'flows' ? { flowMode } : {}) }) }
  const saveRow = (row: Row) => {
    if (!editor || !snapshot) return
    const next = structuredClone(snapshot.data)
    if (editor.collection === 'settings') next.settings = row as unknown as FinanceData['settings']
    else {
      const rows = next[editor.collection] as unknown as Row[]
      const found = rows.findIndex(item => item.id === row.id)
      if (found < 0) rows.push(row); else rows[found] = row
    }
    void persist(next, '已保存，相关统计已更新。')
  }
  const remove = () => {
    if (!snapshot || !removing) return
    const next = structuredClone(snapshot.data)
    const rows = next[removing.collection] as unknown as Row[]
    rows.splice(rows.findIndex(row => row.id === removing.row.id), 1)
    void persist(next, '已删除，相关统计已更新。')
  }
  const exportBackup = () => {
    if (!snapshot) return
    const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }))
    link.href = url; link.download = `家庭财务备份-${chinaDate()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const actions = (collection: Collection, item: object) => {
    const row = item as Row
    return admin ? <div className="family-finance-row-actions"><HohoButton variant="text" size="small" aria-label={`编辑${row.name}`} onClick={() => open(collection, row)}><Pencil size={14}/>编辑</HohoButton><HohoButton variant="text" size="small" aria-label={`删除${row.name}`} onClick={() => { setMutationError(''); setRemoving({ collection, row }) }}><Trash2 size={14}/><span className="sr-only">删除</span></HohoButton></div> : null
  }
  const table = (label: string, headers: string[], rows: ReactNode[], empty: string) => <div className="family-table-scroll" tabIndex={0} role="region" aria-label={label}><table className={`family-record-table family-finance-table${['资产明细', '现金与存款账户'].includes(label) ? ' family-asset-table' : ''}`}><caption className="sr-only">{label}</caption><thead><tr>{headers.map(header => <th scope="col" key={header}>{header}</th>)}{admin && <th scope="col">操作</th>}</tr></thead><tbody>{rows.length ? rows : <tr><td colSpan={headers.length + Number(admin)}><div className="family-table-empty"><strong>{empty}</strong><span>{admin ? '点击右上方新增，填写当前资料。' : '管理员录入后会在这里显示。'}</span></div></td></tr>}</tbody></table></div>
  const attachmentRow = (asset: Asset) => <tr className="family-asset-attachment-row"><td colSpan={6 + Number(admin)}><AssetAttachments assetId={asset.id} assetName={asset.name} files={(snapshot?.attachments ?? []).filter(file => file.assetId === asset.id)} admin={admin} disabled={busy} onChange={next => setSnapshot(previous => !previous || next.revision >= previous.revision ? next : previous)} onUnauthorized={() => unauthorized.current()}/></td></tr>
  const sectionHeading = (title: string, collection?: Collection) => <div className="family-section-heading"><h3 className="hoho-text-section-title">{title}</h3>{admin && collection && <HohoButton variant="secondary" size="small" onClick={() => open(collection)}><Plus size={16}/>新增{names[collection]}</HohoButton>}</div>
  const metrics = (items: [string, string, string][], label: string) => <section className="family-summary family-finance-metrics" aria-label={label}>{items.map(([title, value, hint]) => <div key={title}><span>{title}</span><strong>{value}</strong><small>{hint}</small></div>)}</section>
  if (!snapshot) return <section className="family-page-section"><h2 className="hoho-text-section-title">{title}</h2>{loading ? <p role="status">正在载入家庭财务资料…</p> : <StatusNotice tone="error" title="财务资料载入失败" action={<HohoButton variant="secondary" onClick={() => void load()}>重试</HohoButton>}>{error}</StatusNotice>}</section>
  const data = snapshot.data, summary = financeSummary(data, month, owner), all = financeSummary(data, month)
  const owned = (row: { owner: string }) => !owner || row.owner === owner
  const assets = data.assets.filter(owned).filter(row => !assetScope || assetScope.includes(row.category))
  const debts = data.debts.filter(owned).filter(row => !debtScope || debtScope.includes(row.category))
  const flows = data.flows.filter(row => owned(row) && row.month === month && (!flowPattern || row.pattern === flowPattern) && (!flowScope || flowScope.includes(row.kind)))
  const flowSummary = financeSummary({ ...data, flows }, month, owner)
  const actualMoney = (n: number) => flowSummary.hasActual ? money(n) : '—'
  const forecast = forecastMonths(data, month, owner)
  const filteredMoney = (rows: object[], key: string) => rows.reduce((sum, row) => sum + Math.round(Number((row as Row)[key] ?? 0) * 100), 0) / 100
  const navigate = (label: string, location: WorkspaceLocation, selectedMonth?: string) => <a className="family-finance-source-link" href={locationHash(location)} onClick={event => { event.preventDefault(); if (selectedMonth) setMonth(selectedMonth); onNavigate(location) }}>{label}</a>
  const policies = data.policies.filter(row => !owner || row.insured === owner)
  const currentActual = (n: number) => summary.hasActual ? money(n) : '—'
  const currentBudget = (n: number) => summary.hasBudget ? money(n) : '—'
  const stateEmpty = !hasData(data)
  const upcoming = [...debts.filter(row => row.dueDate).map(row => ({ id: row.id, date: row.dueDate, label: row.name, detail: `还款 ${money(row.monthlyPayment)}` })), ...policies.filter(row => activePolicy(row) && row.dueDate).map(row => ({ id: row.id, date: row.dueDate, label: row.name, detail: `续费 ${money(row.premium)}` }))].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)
  return <section className="family-finance" aria-label={title}>
    <div className="family-section-heading"><div><h2 className="hoho-text-section-title">{title}</h2><p className="hoho-text-caption">{admin ? '管理员可编辑' : '家人只读'} · 人民币 / 元 · {snapshot.updatedAt ? `${updated(snapshot.updatedAt)} 由 ${snapshot.updatedBy} 保存` : '从当前家庭情况开始录入'}</p></div><div className="family-finance-tools"><HohoButton variant="ghost" size="small" disabled={loading || busy} onClick={() => { setNotice(''); void load() }}><RefreshCw size={15}/>{loading ? '载入中' : '重新载入'}</HohoButton>{admin && <HohoButton variant="secondary" size="small" onClick={exportBackup}><Download size={15}/>导出备份</HohoButton>}</div></div>
    {error && <StatusNotice tone="error" title="载入失败">{error} 当前仍显示上次成功载入的资料。</StatusNotice>}
    {notice && <p className="family-finance-saved" role="status">{notice}</p>}
    <div className="family-finance-filters"><label className="hoho-field"><span className="hoho-text-label">统计月份</span><input className="hoho-input" type="month" min="2000-01" max="2099-12" value={month} onChange={event => { if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value) }}/></label><label className="hoho-field"><span className="hoho-text-label">成员范围</span><select className="hoho-input" value={owner} onChange={event => setOwner(event.target.value)}><option value="">全家汇总</option>{all.owners.map(name => <option key={name}>{name}</option>)}</select></label><p className="hoho-text-caption">收支按所选月份统计；资产为各项最近估值。{owner && '保险按被保人筛选。'}</p></div>
    {view === 'overview' && <>
      {stateEmpty && <div className="family-finance-start"><div><h3 className="hoho-text-section-title">先看清家底，再安排每个月。</h3><p>还没有财务资料。可先登记账户余额与欠款，再填写月度计划和实际金额。</p></div>{admin && <HohoButton onClick={() => onNavigate({ module: 'assets', page: 'records', section: 'all' })}>前往登记资产</HohoButton>}</div>}
      {metrics([['家庭净资产', summary.assetCount || summary.debtCount ? money(summary.netAssets) : '—', '资产总额 − 剩余负债'], ['本月收支结余', currentActual(summary.surplus), '实际收入 − 生活支出'], ['本月可安排结余', currentActual(summary.disposable), '再扣除偿还本金与储蓄配置'], ['已指定应急储备', summary.assetCount ? money(summary.reserve) : '—', '随时可取且指定为应急的现金/存款']], '家庭财务核心指标')}
      <div className="family-finance-two-col"><section>{sectionHeading('财务结构')}<dl className="family-finance-facts"><div><dt>资产总额</dt><dd>{summary.assetCount ? money(summary.totalAssets) : '—'}</dd></div><div><dt>剩余负债</dt><dd>{summary.debtCount ? money(summary.totalDebts) : '—'}</dd></div><div><dt>负债 / 资产</dt><dd>{percent(summary.debtRatio)}</dd></div><div><dt>当月收支结余率</dt><dd>{summary.hasActual ? percent(summary.savingsRate) : '—'}</dd></div><div><dt>偿债支出 / 实际收入</dt><dd>{summary.hasActual ? percent(summary.repaymentRatio) : '—'}</dd></div><div><dt>必要开支可支持月数（全家）</dt><dd>{all.coverageMonths === null ? '待设置开支基线' : `${all.coverageMonths.toFixed(1)} 个月`}</dd></div></dl><p className="family-section-note">各项指标用于观察，不按单一比例判断“健康”，也不推算可借款额度。仅登记一侧资料时，净资产仍待补全。</p></section><section>{sectionHeading('还款与续费日期')}<ul className="family-finance-upcoming">{upcoming.length ? upcoming.map(item => <li key={item.id}><span><strong>{item.label}</strong><small>{item.date}{item.date < chinaDate() ? ' · 日期已过，请核对' : ''}</small></span><span>{item.detail}</span></li>) : <li>录入负债或保单的下次日期后显示。</li>}</ul><p className="family-section-note">仅展示已登记日期，不代表已付款或已发送提醒。</p></section></div>
      <div className="family-finance-source-links">{navigate('维护资产明细', { module: 'assets', page: 'records', section: 'all' })}{navigate('维护收支记录', { module: 'finances', page: 'transactions', section: 'actual' })}{navigate('制定预算与计划', { module: 'finances', page: 'budget', section: 'monthly' })}{navigate('维护保险保单', { module: 'safety', page: 'insurance', section: 'policies' })}</div>
      <details className="family-finance-definitions"><summary>统计口径与避免重复计算</summary><ul><li>现金、投资和房产按当前余额或估值登记；贷款登记剩余欠款。未填资料不代表没有资产或负债。</li><li>账户余额是存量；月度收入和支出是流量。两者分别维护，不自动相加或互相改写。</li><li>家庭内部转账不算收入和支出；偿还本金单列，贷款利息记为生活支出中的“借款利息”。</li><li>保险页的保费是合同信息。实际扣款请在月度项目记录一次，系统不会重复追加。</li><li>授信额度不是现金资产；不同保险责任的保额不能加成一笔可用资金。</li><li>应收款按预计可收回金额填写；无法随时动用的存款不作为应急储备。</li></ul></details>
    </>}
    {view === 'balance' && <>
      {balancePart === 'debts' ? metrics([['当前负债余额', debts.length ? money(filteredMoney(debts, 'balance')) : '—', '当前成员和类别的剩余欠款'], ['每期应还合计', debts.some(row => row.monthlyPayment !== null) ? money(filteredMoney(debts, 'monthlyPayment')) : '—', '仅汇总已填每期金额，不代表同日扣款'], ['负债项目', `${debts.length} 项`, '当前筛选范围'], ['授信额度', '不计资产', '未使用的额度不作为可用现金']], '负债与还款汇总') : metrics([['当前分类资产', assets.length ? money(filteredMoney(assets, 'amount')) : '—', '当前成员和类别的最近余额或估值'], ['全部资产金额', summary.assetCount ? money(summary.totalAssets) : '—', '所选成员全部资产'], ['当前分类可动用现金', assets.length ? money(filteredMoney(assets.filter(availableAsset), 'amount')) : '—', '随时可取的现金与存款'], ['资产项目', `${assets.length} 项`, '附件和有效期随对应资产保存']], '资产明细汇总')}
      {balancePart !== 'debts' && <section className="family-finance-section">{sectionHeading('资产明细', 'assets')}{table('资产明细', ['名称 / 类别', '归属成员', '余额或估值', '占总资产', '日期管理', '流动性'], assets.map(row => <Fragment key={row.id}><tr><th scope="row">{row.name}<small>{assetCategories[row.category]}{row.note && ` · ${row.note}`}</small></th><td>{row.owner}</td><td>{money(row.amount)}</td><td>{summary.totalAssets > 0 ? percent(row.amount / summary.totalAssets) : '—'}</td><td><AssetDates asset={row}/></td><td>{availableAsset(row) ? row.emergency ? '随时可取 / 应急' : '随时可取' : '非随时可取'}</td>{admin && <td>{actions('assets', row)}</td>}</tr>{attachmentRow(row)}</Fragment>), '尚未登记资产')}</section>}
      {balancePart === 'debts' && <section className="family-finance-section">{sectionHeading('负债与还款', 'debts')}{table('负债与还款', ['名称 / 类别', '归属成员', '剩余欠款', '年化利率', '每期应还', '下次还款'], debts.map(row => <tr key={row.id}><th scope="row">{row.name}<small>{debtCategories[row.category]}{row.creditLimit !== null && ` · 额度 ${money(row.creditLimit)}（不计资产）`}{row.note && ` · ${row.note}`}</small></th><td>{row.owner}</td><td>{money(row.balance)}</td><td>{row.apr === null ? '—' : `${row.apr}%`}</td><td>{money(row.monthlyPayment)}</td><td>{row.dueDate || '—'}</td>{admin && <td>{actions('debts', row)}</td>}</tr>), '尚未登记负债')}</section>}
      <p className="family-section-note">资产占比使用资产总额作分母。房产与对应房贷分别登记，净资产统一计算；每期应还不会自动修改月度收支。</p>
    </>}
    {view === 'monthly' && <>
      {flowMode === 'actual' ? metrics([...(flowScope?.includes('transfer') ? [['偿还本金', actualMoney(flowSummary.principal), '不算生活消费'], ['储蓄与投资配置', actualMoney(flowSummary.savings), '记录资金用途安排'], ['内部划转', actualMoney(filteredMoney(flows.filter(row => row.kind === 'transfer'), 'actual')), '不计收入和支出']] as [string, string, string][] : [['实际收入', actualMoney(flowSummary.income), '当前筛选范围的已录入收入'], ['实际生活支出', actualMoney(flowSummary.expenses), '不包含本金、储蓄配置与内部转账'], ['实际收支结余', actualMoney(flowSummary.surplus), '当前范围实际收入 − 生活支出']] as [string, string, string][]), ['已核对项目', `${flows.filter(row => row.actual !== null).length} / ${flows.length} 项`, '实际金额留空的项目不补零']], '实际收支汇总') : metrics([['计划可安排结余', currentBudget(summary.plannedDisposable), '计划收入 − 支出 − 本金 − 储蓄配置'], ['计划生活支出', currentBudget(summary.plannedExpenses), `${month} 已制定的生活支出额度`], ['实际生活支出', currentActual(summary.expenses), '已在收支记录核对的金额'], ['生活支出预算剩余', summary.hasActual && summary.hasBudget ? money(summary.budgetRemaining) : '—', '生活支出计划 − 已录入实际支出']], '月度预算执行汇总')}
      {sectionHeading(`${month} ${flowMode === 'actual' ? '实际收支项目' : '预算项目'}`, 'flows')}
      <p className="family-subpage-description">{flowMode === 'actual' ? '每个项目填写当月累计实际值；同一项目请编辑更新。预算与这里共用项目，避免重复记账。' : '为已有项目制定计划，并对照实际执行；已在收支记录登记的项目无需再次新增。'}{flows.length > 0 && ` 当前范围 ${flows.length} 项，其中 ${flows.filter(row => row.actual === null).length} 项实际金额尚未核对、${flows.filter(row => row.budget === null).length} 项尚未设定计划。`}</p>
      {table(flowMode === 'actual' ? '实际收支记录' : '月度预算与实际', flowMode === 'actual' ? ['项目 / 分类', '类型', '归属成员', '实际金额'] : ['项目 / 分类', '类型', '归属成员', '计划', '实际', '差额（实际−计划）'], flows.map(row => <tr key={row.id}><th scope="row">{row.name}<small>{row.category}{row.essential && ' · 必要开支'}{row.note && ` · ${row.note}`}</small></th><td>{flowKinds[row.kind]}<small>{flowPatterns[row.pattern ?? 'variable']}</small></td><td>{row.owner}</td>{flowMode === 'budget' && <td>{money(row.budget)}</td>}<td>{money(row.actual)}</td>{flowMode === 'budget' && <td>{row.actual !== null && row.budget !== null ? money((Math.round(row.actual * 100) - Math.round(row.budget * 100)) / 100) : '—'}</td>}{admin && <td>{actions('flows', row)}</td>}</tr>), '本月尚无项目')}
      {flowMode === 'budget' && <dl className="family-finance-facts family-finance-month-totals"><div><dt>固定生活支出</dt><dd>{actualMoney(flowSummary.fixedExpenses)}</dd></div><div><dt>浮动生活支出</dt><dd>{actualMoney(flowSummary.variableExpenses)}</dd></div><div><dt>一次性生活支出</dt><dd>{actualMoney(flowSummary.oneoffExpenses)}</dd></div><div><dt>实际收支结余</dt><dd>{actualMoney(flowSummary.surplus)}</dd></div><div><dt>偿还本金</dt><dd>{actualMoney(flowSummary.principal)}</dd></div><div><dt>储蓄与投资配置</dt><dd>{actualMoney(flowSummary.savings)}</dd></div></dl>}
      <p className="family-section-note">内部转账仅供核对，不计入上述合计。储蓄配置不算消费；偿还本金也不算生活支出。实际结余仅基于已录入项目，尚未核对的金额不补零。</p>
    </>}
    {view === 'forecast' && <>
      {sectionHeading('未来六个月现金流测算')}
      <p className="family-subpage-description">以统计月份为起点，按各月已登记计划测算。当前可动用现金为起始参考，非历史月初余额；没有计划的月份保持未知。</p>
      {table('现金流测算', ['月份', '计划收入', '生活支出', '偿还本金', '储蓄配置', '可安排结余', '参考期末现金'], forecast.map(row => <tr key={row.month}><th scope="row">{row.month}</th><td>{money(row.income)}</td><td>{money(row.expenses)}</td><td>{money(row.principal)}</td><td>{money(row.savings)}</td><td>{money(row.change)}</td><td>{money(row.closing)}</td>{admin && <td>{navigate('维护月度计划', { module: 'finances', page: 'budget', section: 'monthly' }, row.month)}</td>}</tr>), '尚未登记计划')}
      <p className="family-section-note">测算只包含已录入计划，不代表付款承诺。内部转账不计收支；未登记计划造成的断档不按零处理。{navigate('前往月度预算与执行', { module: 'finances', page: 'budget', section: 'monthly' })}。</p>
    </>}
    {view === 'reserve' && <>
      {metrics([['可随时动用资金', summary.assetCount ? money(summary.liquid) : '—', '勾选随时可取的现金与存款'], ['已指定应急储备', summary.assetCount ? money(summary.reserve) : '—', '可动用资金中已指定用途的部分'], ['全家储备目标', money(all.reserveTarget), `必要月开支 × ${data.settings.reserveMonths} 个月`], ['全家储备可支持', all.coverageMonths === null ? '—' : `${all.coverageMonths.toFixed(1)} 个月`, '全家应急储备 ÷ 必要月开支']], '现金与应急储备')}
      <div className="family-finance-setting"><div><h3 className="hoho-text-section-title">家庭储备基线</h3><p>每月必要开支 {money(data.settings.essentialMonthly)} · 目标 {data.settings.reserveMonths} 个月{all.reserveTarget !== null && ` · 距目标还差 ${money(Math.max(0, (Math.round(all.reserveTarget * 100) - Math.round(all.reserve * 100)) / 100))}`}</p></div>{admin && <HohoButton variant="secondary" onClick={() => { setMutationError(''); setEditor({ collection: 'settings', row: { ...data.settings }, existing: true }) }}>编辑储备设置</HohoButton>}</div>
      {sectionHeading('应急储备资金来源')}{table('应急储备资金来源', ['账户名称', '归属成员', '余额', '随时可取', '已指定应急', '日期管理'], assets.filter(row => ['cash', 'deposit'].includes(row.category)).map(row => <tr key={row.id}><th scope="row">{row.name}<small>{assetCategories[row.category]}</small></th><td>{row.owner}</td><td>{money(row.amount)}</td><td>{availableAsset(row) ? '是' : '否'}</td><td>{row.emergency ? '是' : '否'}</td><td><AssetDates asset={row}/></td>{admin && <td>{navigate('到资产明细维护', { module: 'assets', page: 'records', section: 'cash' })}</td>}</tr>), '尚未登记现金或存款账户')}
      <p className="family-section-note">账户余额、应急标记、照片和有效期统一在资产明细维护。{navigate('前往现金与存款', { module: 'assets', page: 'records', section: 'cash' })}。信用卡额度、投资市值和应收款均不计入应急现金。</p>
    </>}
    {view === 'insurance' && <>
      {metrics([['有效保单', `${summary.policyCount} 份`, '按状态与保障到期日计算'], ['年度经常性保费', policies.length ? money(summary.annualPremium) : '—', '有效保单月缴×12 / 季缴×4 / 年缴'], ['折合月均保费', policies.length ? money(summary.annualPremium / 12) : '—', '用于预算参考，不等于本月扣款'], ['一次性缴费保单', `${policies.filter(row => row.frequency === 'once').length} 份`, '不计入经常性年度保费']], '家庭保险概览')}
      {sectionHeading('按被保人整理保障', 'policies')}{table('保险保障明细', ['保单 / 保险公司', '被保人 / 缴费人', '险种 / 主保额', '每期保费', '续费 / 到期', '状态'], policies.map(row => <tr key={row.id}><th scope="row">{row.name}<small>{row.insurer || '未填保险公司'}{row.policyNumber && ` · ${row.policyNumber}`}</small><small>{row.note}</small></th><td>{row.insured}<small>缴费：{row.owner}</small></td><td>{policyCategories[row.category]}<small>{money(row.coverage)}</small></td><td>{money(row.premium)}<small>{premiumPeriods[row.frequency]}{activePolicy(row) && row.frequency !== 'once' && ` · 年折合 ${money(annualPremium(row))}`}</small></td><td>{row.dueDate || '未填续费日'}<small>到期：{row.endDate || '未填'}</small></td><td>{activePolicy(row) ? '有效' : row.status === 'cancelled' ? '已终止' : '已到期'}</td>{admin && <td>{actions('policies', row)}</td>}</tr>), '尚未登记保单')}
      <p className="family-section-note">保额按被保人、险种和责任分别查看，不跨险种求和。保费仅供预算参考，实际支付请在月度项目登记一次。未填到期日的保单按手动状态统计。</p>
    </>}
    {view === 'goals' && <>
      {sectionHeading('把结余安排给家庭目标', 'goals')}
      <p className="family-subpage-description">每个目标单独跟踪计划、已备金额与期限。请避免把同一笔资金同时分配给多个目标。</p>
      {table('资金目标明细', ['目标 / 类型', '归属成员', '目标金额', '已备金额', '进度', '目标日期'], data.goals.filter(owned).map(row => <tr key={row.id}><th scope="row">{row.name}<small>{goalCategories[row.category]}{row.note && ` · ${row.note}`}</small></th><td>{row.owner}</td><td>{money(row.target)}</td><td>{money(row.funded)}</td><td><progress value={Math.min(row.funded, row.target)} max={row.target} aria-label={`${row.name}完成进度`}/><small>{percent(row.funded / row.target)}</small></td><td>{row.dueDate || '—'}</td>{admin && <td>{actions('goals', row)}</td>}</tr>), '尚未设置资金目标')}
      <p className="family-section-note">已备金额是用途分配记录，不新增资产，也不自动扣减账户余额。月度储蓄配置与目标进度分别维护。</p>
    </>}
    {editor && <FinanceEditor key={`${editor.collection}-${editor.row.id ?? 'settings'}`} editor={editor} busy={busy} error={mutationError} onClose={() => { if (!busy) setEditor(undefined) }} onSave={saveRow}/>}
    <ConfirmDialog open={Boolean(removing)} title="删除财务记录" description={`确定删除“${removing?.row.name ?? ''}”？保存后将更新相关合计。`} confirmLabel="确认删除" danger loading={busy} onCancel={() => { if (!busy) { setRemoving(undefined); setMutationError('') } }} onConfirm={remove}/>
    {removing && mutationError && <div className="family-finance-delete-error" role="alert">{mutationError}</div>}
  </section>
}

function FinanceEditor({ editor, busy, error, onClose, onSave }: { editor: Editor; busy: boolean; error: string; onClose: () => void; onSave: (row: Row) => void }) {
  const [row, setRow] = useState(editor.row)
  const [localError, setLocalError] = useState('')
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  usePageScrollLock(true); useDialogFocus(true, ref)
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) closeRef.current() }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape) }, [busy])
  const change = (key: string, value: Row[string]) => setRow(previous => {
    const next = { ...previous, [key]: value }
    if (editor.collection === 'assets') {
      if (key === 'category' && !['cash', 'deposit'].includes(String(value))) { next.available = false; next.emergency = false }
      if (key === 'endDatePrecision') next.endDate = value === 'month' ? String(previous.endDate ?? '').slice(0, 7) : ''
      if (key === 'available' && !value) next.emergency = false
    }
    return next
  })
  const submit = (event: FormEvent) => {
    event.preventDefault(); setLocalError('')
    if (busy) return
    if (editor.collection === 'flows' && editor.flowMode === 'actual' && row.actual === null) { setLocalError('请填写本月累计实际金额；尚未发生可填写 0。'); return }
    if (editor.collection === 'flows' && row.budget === null && row.actual === null) { setLocalError('计划金额或实际金额至少填写一项。'); return }
    if (editor.collection === 'goals' && Number(row.target) <= 0) { setLocalError('目标金额须大于 0。'); return }
    onSave(row)
  }
  const title = editor.collection === 'settings' ? '储备设置' : `${editor.existing ? '编辑' : '新增'}${names[editor.collection]}`
  return <div className="family-finance-editor-layer"><button type="button" className="family-assistant-backdrop" aria-label={`关闭${title}`} onClick={() => { if (!busy) onClose() }}/><ModalSurface className="family-finance-editor" label={title} ref={ref} tabIndex={-1}>
    <form onSubmit={submit}><header><h2 className="hoho-text-section-title">{title}</h2><HohoButton variant="ghost" size="icon" aria-label="关闭编辑" disabled={busy} onClick={onClose}><X size={18}/></HohoButton></header>
      <div className="family-finance-editor-fields">{fields[editor.collection].filter(field => !(editor.collection === 'flows' && editor.flowMode === 'actual' && field.key === 'budget')).map(field => {
        if (editor.collection === 'assets' && field.key === 'endDate') field = { ...field, type: row.endDatePrecision === 'month' ? 'month' : 'date', hint: row.endDatePrecision === 'month' ? '按卡面月/年选择；有效至该月最后一天。' : '按资料填写完整日期，可留空。' }
        const value = row[field.key], id = `family-finance-${field.key}`
        if (field.type === 'check') {
          const disabled = editor.collection === 'assets' && (!['cash', 'deposit'].includes(String(row.category)) || (field.key === 'emergency' && !row.available))
          return <label className="family-remember" key={field.key}><input id={id} type="checkbox" aria-label={field.label} aria-describedby={field.hint ? `${id}-hint` : undefined} checked={Boolean(value)} disabled={busy || disabled} onChange={event => change(field.key, event.target.checked)}/><span>{field.label}<small id={`${id}-hint`}>{field.hint}</small></span></label>
        }
        if (field.options) return <label className="hoho-field" key={field.key} htmlFor={id}><span className="hoho-text-label">{field.label}</span><select id={id} className="hoho-input" value={String(value ?? '')} disabled={busy} onChange={event => change(field.key, event.target.value)}>{Object.entries(field.options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        if (field.type === 'note') return <label className="hoho-field family-finance-wide" key={field.key} htmlFor={id}><span className="hoho-text-label">{field.label}</span><textarea className="hoho-input" id={id} rows={3} maxLength={2000} disabled={busy} value={String(value ?? '')} onChange={event => change(field.key, event.target.value)}/>{field.hint && <span className="hoho-field__message">{field.hint}</span>}</label>
        const numeric = field.type === 'money' || field.type === 'number'
        return <HohoInput key={field.key} label={field.label} aria-label={field.label} id={id} hint={field.hint} type={numeric ? 'number' : field.type === 'month' ? 'month' : field.type === 'date' ? 'date' : 'text'} inputMode={numeric ? 'decimal' : undefined} min={numeric ? (field.type === 'number' && field.key !== 'remindDays' ? 1 : 0) : field.type === 'date' ? '2000-01-01' : field.type === 'month' ? '2000-01' : undefined} max={numeric ? (field.type === 'number' ? field.key === 'remindDays' ? 365 : 120 : field.key === 'apr' ? 100 : 1e10) : field.type === 'date' ? '2099-12-31' : field.type === 'month' ? '2099-12' : undefined} step={numeric ? field.type === 'number' ? 1 : '0.01' : undefined} maxLength={field.key === 'owner' || field.key === 'insured' ? 40 : field.key === 'category' ? 60 : field.key === 'policyNumber' ? 100 : 120} required={field.required} disabled={busy} value={value == null ? '' : String(value)} onChange={event => change(field.key, numeric ? event.target.value === '' ? null : Number(event.target.value) : event.target.value)}/>
      })}</div>
      {(localError || error) && <StatusNotice tone="error" title="未保存，填写内容已保留">{localError || error}</StatusNotice>}
      <footer><HohoButton variant="secondary" disabled={busy} onClick={onClose}>取消</HohoButton><HohoButton type="submit" loading={busy}>保存{editor.collection === 'settings' ? '设置' : '记录'}</HohoButton></footer>
    </form></ModalSurface></div>
}

function AssetDates({ asset }: { asset: Asset }) {
  const expiry = assetExpiry(asset)
  return <div className="family-asset-dates"><span>估值：{asset.valuedAt}</span>{asset.startDate && <small>取得 / 开卡：{asset.startDate}</small>}{expiry ? <><small>有效期至：{asset.endDate}{asset.endDatePrecision === 'month' ? ' 月底' : ''}</small><small data-state={expiry.state}>{expiry.label}</small></> : <small>未设置有效期</small>}</div>
}
