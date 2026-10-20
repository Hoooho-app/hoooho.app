import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDown, Check, FileText, Pencil, Plus, RefreshCw, X } from 'lucide-react'
import { HohoButton } from '../../components/design-system/HohoButton'
import { HohoInput } from '../../components/design-system/HohoInput'
import { ModalSurface } from '../../components/design-system/ModalSurface'
import { StatusNotice } from '../../components/design-system/StatusNotice'
import { ConfirmDialog } from '../../components/design-system/ConfirmDialog'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { policyStatuses, policyFrequencies, type PolicyDocument, type PolicyRecord, type PolicyStatus, type PolicyFrequency } from '../../../shared/family-policies.mjs'
import { api, FamilyApiError, messageOf } from './api'
import { policySections, type PolicyView, type WorkspaceModule } from './navigation'
import './policies.css'

const updated = (time: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(time)
const sectionId = (index: number) => `family-policy-section-${index}`

export function FamilyPolicy({ module, admin, view, onViewChange: setView, onUnauthorized }: { module: WorkspaceModule; admin: boolean; view: PolicyView; onViewChange: (view: PolicyView) => void; onUnauthorized: () => void }) {
  const [record, setRecord] = useState<PolicyRecord>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(false)
  const mounted = useRef(true)
  const unauthorized = useRef(onUnauthorized); unauthorized.current = onUnauthorized
  const fail = (cause: unknown) => { if (cause instanceof FamilyApiError && cause.status === 401) unauthorized.current(); return messageOf(cause) }
  const load = async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try { const next = await api<PolicyRecord>(`/policies/${module.id}`, undefined, signal); if (mounted.current && !signal?.aborted) setRecord(next) }
    catch (cause) { if (mounted.current && !signal?.aborted) setError(fail(cause)) }
    finally { if (mounted.current && !signal?.aborted) setLoading(false) }
  }
  useEffect(() => { mounted.current = true; const controller = new AbortController(); void load(controller.signal); return () => { mounted.current = false; controller.abort() } }, [module.id])
  const jump = (index: number) => {
    setView('text')
    requestAnimationFrame(() => { const element = window.document.getElementById(sectionId(index)); element?.scrollIntoView({ block: 'start', behavior: 'instant' }); element?.focus({ preventScroll: true }) })
  }
  const document = record?.document
  return <>
    <header className="family-page-heading"><div><p className="hoho-text-caption">FAMILY AGREEMENTS / 家庭制度</p><h1 id="family-page-title" tabIndex={-1} className="hoho-text-display">{module.title}</h1><p>先有可执行的约定，再在日常中慢慢完善。</p></div></header>
    <section className="family-policy" aria-label="本类制度" aria-busy={loading}>
      {loading ? <p className="family-policy-loading" role="status">正在载入本类制度…</p> : error ? <StatusNotice tone="error" title="制度未能载入" action={<HohoButton variant="secondary" onClick={() => void load()}>重试</HohoButton>}>{error}</StatusNotice> : document && record ? <>
        <div className="family-policy-heading"><div><div className="family-policy-meta"><span>{record.revision ? `V${record.revision} · 家庭版本` : 'V0.1 · 建议初稿'}</span><span>{policyStatuses[document.status]}</span></div><h2 className="hoho-text-page-title">{document.title}</h2><p>{document.purpose}</p></div><div className="family-policy-tools"><HohoButton variant="ghost" size="icon" aria-label="重新载入制度" onClick={() => void load()}><RefreshCw size={16}/></HohoButton>{admin && <HohoButton variant="secondary" onClick={() => { setNotice(''); setEditing(true) }}><Pencil size={15} aria-hidden="true"/>编辑制度</HohoButton>}</div></div>
        <div className="family-policy-principles" aria-label="基本原则">{document.principles.map((principle, index) => <span key={index}><Check size={14} aria-hidden="true"/>{principle}</span>)}</div>
        <p className="family-policy-version">{record.updatedAt ? `${updated(record.updatedAt)}（北京时间）由 ${record.updatedBy} 更新。` : '这是一份建议初稿，尚未经家庭讨论确认。'} {admin ? '可修改正文、流程与分工，保存后家人同步查看。' : '家人可查看，修改请与管理员商定。'}</p>
        {notice && <p className="family-policy-notice" role="status">{notice}</p>}
        <div id="family-policy-panel" role="region" aria-label={policySections.find(item => item.id === view)?.title} tabIndex={0}>
          {view === 'text' && <div className="family-policy-text"><div className="family-policy-contents"><span className="hoho-text-caption">本页目录</span>{document.sections.map((section, index) => <button key={index} type="button" onClick={() => jump(index)}>{String(index + 1).padStart(2, '0')} {section.title}</button>)}</div><div>{document.sections.map((section, index) => <section className="family-policy-section" key={index} aria-labelledby={sectionId(index)}><h3 id={sectionId(index)} tabIndex={-1} className="hoho-text-section-title"><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</h3><ol className="family-policy-rules">{section.items.map((item, i) => <li key={i}>{item}</li>)}</ol></section>)}<div className="family-policy-exception"><h3 className="hoho-text-card-title">例外与紧急情况</h3><p>{document.exception}</p></div></div></div>}
          {view === 'flow' && <PolicyFlow document={document}/>}
          {view === 'mindmap' && <figure className="family-policy-mindmap"><figcaption><h3 className="hoho-text-section-title">一张图看清本类约定</h3><p>点击章节节点，展开阅读对应制度正文。</p></figcaption><div className="family-policy-tree"><div className="family-policy-tree-root">{document.title}</div><ul>{document.sections.map((section, index) => <li key={index}><button type="button" onClick={() => jump(index)}><span>{String(index + 1).padStart(2, '0')}</span>{section.title}<FileText size={14} aria-hidden="true"/></button><ul>{section.items.map((item, i) => <li key={i}>{item}</li>)}</ul></li>)}</ul></div></figure>}
          {view === 'checks' && <PolicyChecks document={document}/>}
        </div>
        <aside className="family-policy-pending"><h3 className="hoho-text-card-title">留给家人一起商定</h3><p>这些内容暂不替你定死，讨论后可在“编辑制度”里逐项细化。</p><ol>{document.pending.map((item, index) => <li key={index}><span>{index + 1}</span>{item}</li>)}</ol></aside>
      </> : null}
    </section>
    {editing && record && <PolicyEditor record={record} onClose={() => setEditing(false)} onUnauthorized={onUnauthorized} onSave={next => { setRecord(next); setEditing(false); setNotice('制度已保存，正文、流程、脑图与检查表已同步更新。') }}/>}
  </>
}

function PolicyFlow({ document }: { document: PolicyDocument }) {
  const { flow } = document
  const down = <ArrowDown className="family-policy-flow-arrow" size={20} aria-hidden="true"/>
  return <figure className="family-policy-flow"><figcaption><h3 className="hoho-text-section-title">从一件事到一次复盘</h3><p>按情况选择路径，办理结果回到记录与复盘。</p></figcaption><div className="family-policy-flow-diagram" aria-label="制度执行流程图">
    <div className="family-policy-flow-node"><small>发起</small><strong>{flow.capture}</strong></div>{down}
    <div className="family-policy-flow-node"><small>核对</small><strong>{flow.check}</strong></div>{down}
    <div className="family-policy-flow-question"><svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><polygon points="200,1 399,60 200,119 1,60"/></svg><strong>{flow.decision}</strong></div>
    <svg className="family-policy-flow-fork" viewBox="0 0 400 30" preserveAspectRatio="none" aria-hidden="true"><path d="M200 0 V14 H70 V30 M200 14 H330 V30"/></svg>
    <div className="family-policy-flow-branches"><div><small>按常规安排</small><strong>{flow.routine}</strong></div><div><small>需协商、核实或应急</small><strong>{flow.discuss}</strong></div></div>
    <svg className="family-policy-flow-fork" viewBox="0 0 400 30" preserveAspectRatio="none" aria-hidden="true"><path d="M70 0 V14 H330 V0 M200 14 V30"/></svg>
    <div className="family-policy-flow-node"><small>完成与留存</small><strong>{flow.execute}</strong></div>{down}
    <div className="family-policy-flow-node"><small>复盘与调整</small><strong>{flow.review}</strong></div>
  </div><div className="family-policy-exception"><h3 className="hoho-text-card-title">例外与紧急情况</h3><p>{document.exception}</p></div></figure>
}

function PolicyChecks({ document }: { document: PolicyDocument }) {
  const frequencies = Object.entries(policyFrequencies) as [PolicyFrequency, string][]
  return <div className="family-policy-checks"><h3 className="hoho-text-section-title">谁负责，做到什么程度</h3><p>下列是建议分工；含“待商定”的人员仍需家庭确认。</p><div className="family-table-scroll" role="region" aria-label="制度责任分工表" tabIndex={0}><table className="family-record-table family-policy-table"><caption className="sr-only">制度责任分工、替补和完成标准</caption><thead><tr><th scope="col">事项</th><th scope="col">主负责人 / 替补人</th><th scope="col">频率</th><th scope="col">完成标准</th></tr></thead><tbody>{document.responsibilities.map((row, index) => <tr key={index}><th scope="row">{row.task}</th><td>{row.owner}<small>替补：{row.backup}</small></td><td>{policyFrequencies[row.frequency]}</td><td>{row.standard}</td></tr>)}</tbody></table></div><h3 className="hoho-text-section-title">执行频率一览</h3><p>标记表示约定频率，具体日期和通知方式由家人商定。</p><div className="family-table-scroll" role="region" aria-label="制度执行频率图表" tabIndex={0}><table className="family-record-table family-policy-matrix"><caption className="sr-only">建议执行频率矩阵</caption><thead><tr><th scope="col">事项</th>{frequencies.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead><tbody>{document.responsibilities.map((row, index) => <tr key={index}><th scope="row">{row.task}</th>{frequencies.map(([key]) => <td key={key}>{row.frequency === key ? <><span className="family-policy-dot" aria-hidden="true"/><span className="sr-only">需要执行</span></> : <span aria-label="非约定频率">—</span>}</td>)}</tr>)}</tbody></table></div></div>
}

function TextArea({ label, value, onChange, hint, maxLength = 1200, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; hint?: string; maxLength?: number; rows?: number }) {
  const id = useId()
  return <label className="hoho-field"><span className="hoho-text-label" id={`${id}-label`}>{label}</span><textarea className="hoho-input" aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} rows={rows} required/>{hint && <span className="hoho-field__message" id={`${id}-hint`}>{hint}</span>}</label>
}

function PolicyEditor({ record, onClose, onSave, onUnauthorized }: { record: PolicyRecord; onClose: () => void; onSave: (record: PolicyRecord) => void; onUnauthorized: () => void }) {
  const [draft, setDraft] = useState<PolicyDocument>(() => structuredClone(record.document))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const pending = useRef(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(record.document)
  useDialogFocus(!confirmClose, ref)
  usePageScrollLock(true)
  const update = <K extends keyof PolicyDocument,>(key: K, value: PolicyDocument[K]) => setDraft(current => ({ ...current, [key]: value }))
  const close = () => { if (busy) return; if (dirty) setConfirmClose(true); else onClose() }
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { onSave(await api<PolicyRecord>(`/policies/${record.moduleId}`, { revision: record.revision, document: draft })) }
    catch (cause) { if (cause instanceof FamilyApiError && cause.status === 401) onUnauthorized(); else setError(messageOf(cause)) }
    finally { pending.current = false; setBusy(false) }
  }
  const field = (label: string, children: ReactNode) => <label className="hoho-field"><span className="hoho-text-label">{label}</span>{children}</label>
  return <><div className="family-policy-editor-layer"><button className="family-assistant-backdrop" type="button" aria-label="关闭制度编辑" onClick={close}/><ModalSurface ref={ref} tabIndex={-1} label="编辑本类制度" className="family-policy-editor" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}><form onSubmit={event => void submit(event)}>
    <header><div><p className="hoho-text-caption">逐步细化家庭约定</p><h2 className="hoho-text-section-title">编辑本类制度</h2></div><HohoButton variant="ghost" size="icon" aria-label="关闭编辑" disabled={busy} onClick={close}><X size={18}/></HohoButton></header>
    <p className="family-policy-editor-intro">正文、流程、脑图和检查表共用以下内容。保存不会自动把初稿标成已确认。</p>
    <fieldset disabled={busy} className="family-policy-editor-fields"><legend className="sr-only">制度内容</legend>
      <HohoInput label="制度名称" value={draft.title} required maxLength={60} onChange={event => update('title', event.target.value)}/>
      {field('制度状态', <select className="hoho-input" value={draft.status} onChange={event => update('status', event.target.value as PolicyStatus)}>{Object.entries(policyStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>)}
      <TextArea label="制度目标" value={draft.purpose} onChange={value => update('purpose', value)}/>
      <TextArea label="基本原则" value={draft.principles.join('\n')} maxLength={600} hint="每行一条，最多 6 条，每条不超过 100 字。" onChange={value => update('principles', value.split('\n'))}/>
      <h3 className="hoho-text-section-title">制度正文</h3>{draft.sections.map((section, index) => <div className="family-policy-editor-section" key={index}><HohoInput label={`第 ${index + 1} 节名称`} value={section.title} required maxLength={80} onChange={event => update('sections', draft.sections.map((item, i) => i === index ? { ...item, title: event.target.value } : item))}/><TextArea label={`第 ${index + 1} 节条款`} value={section.items.join('\n')} rows={5} maxLength={14400} hint="每行一条，最多 12 条，每条不超过 1200 字。" onChange={value => update('sections', draft.sections.map((item, i) => i === index ? { ...item, items: value.split('\n') } : item))}/>{draft.sections.length > 1 && <HohoButton size="small" variant="text" onClick={() => update('sections', draft.sections.filter((_, i) => i !== index))}>移除此节</HohoButton>}</div>)}
      {draft.sections.length < 8 && <HohoButton variant="secondary" onClick={() => update('sections', [...draft.sections, { title: '', items: [''] }])}><Plus size={15}/>增加一节</HohoButton>}
      <h3 className="hoho-text-section-title">执行流程</h3>{(Object.entries({ capture: '事项发起', check: '办理前核对', decision: '分支判断问题', routine: '常规路径', discuss: '协商、核实或应急路径', execute: '办理与归档', review: '复盘与调整' }) as [keyof PolicyDocument['flow'], string][]).map(([key, label]) => <HohoInput key={key} label={label} value={draft.flow[key]} required maxLength={160} onChange={event => update('flow', { ...draft.flow, [key]: event.target.value })}/>)}
      <TextArea label="例外与紧急情况" value={draft.exception} onChange={value => update('exception', value)}/>
      <h3 className="hoho-text-section-title">分工与检查</h3>{draft.responsibilities.map((row, index) => { const change = (key: string, value: string) => update('responsibilities', draft.responsibilities.map((item, i) => i === index ? { ...item, [key]: value } : item)); return <div className="family-policy-editor-section" key={index}><HohoInput label={`分工 ${index + 1} · 事项`} value={row.task} required maxLength={100} onChange={event => change('task', event.target.value)}/><div className="family-policy-editor-pair"><HohoInput label={`分工 ${index + 1} · 主负责人`} value={row.owner} required maxLength={100} onChange={event => change('owner', event.target.value)}/><HohoInput label={`分工 ${index + 1} · 替补人`} value={row.backup} required maxLength={100} onChange={event => change('backup', event.target.value)}/></div>{field(`分工 ${index + 1} · 频率`, <select className="hoho-input" value={row.frequency} onChange={event => change('frequency', event.target.value)}>{Object.entries(policyFrequencies).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>)}<TextArea label={`分工 ${index + 1} · 完成标准`} value={row.standard} maxLength={500} rows={2} onChange={value => change('standard', value)}/>{draft.responsibilities.length > 1 && <HohoButton variant="text" size="small" onClick={() => update('responsibilities', draft.responsibilities.filter((_, i) => i !== index))}>移除此项分工</HohoButton>}</div> })}
      {draft.responsibilities.length < 16 && <HohoButton variant="secondary" onClick={() => update('responsibilities', [...draft.responsibilities, { task: '', owner: '待商定', backup: '待商定', frequency: 'monthly', standard: '' }])}><Plus size={15}/>增加分工</HohoButton>}
      <TextArea label="留给家人一起商定" value={draft.pending.join('\n')} rows={4} maxLength={6000} hint="每行一条，最多 12 条。全部确认后可填写下次复盘议题。" onChange={value => update('pending', value.split('\n'))}/>
    </fieldset>
    {error && <StatusNotice tone="error" title="制度未能保存">{error}</StatusNotice>}
    <footer><HohoButton variant="secondary" disabled={busy} onClick={close}>取消</HohoButton><HohoButton type="submit" loading={busy}>保存制度</HohoButton></footer>
  </form></ModalSurface></div><ConfirmDialog open={confirmClose} title="放弃本次修改？" description="本次尚未保存的修改将被放弃，已保存的制度不受影响。" cancelLabel="继续编辑" confirmLabel="放弃修改" onCancel={() => setConfirmClose(false)} onConfirm={onClose}/></>
}
