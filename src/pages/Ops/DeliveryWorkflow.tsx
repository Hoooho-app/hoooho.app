import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HohoButton } from '../../components/design-system/HohoButton'
import { opsApiRequest } from '../../services/opsAuth'
import { ApiRequestError } from '../../services/apiClient'
import { useResource } from './Modules'
import './delivery-workflow.css'

const endpoint = '/api/ops/workflow/delivery'
const statusLabels = { pending: '待核验', working: '进行中', blocked: '阻塞', confirmed: '已核对' }
type State = keyof typeof statusLabels
type Scope = 'setup' | 'release'
type Step = {
  id: string; title: string; location: string; check: string; recovery: string
  links?: { label: string; href: string }[]
  fields?: { name: string; source: string; destination: 'Secret' | 'Variable' }[]
  related?: string[]
  receipt?: 'commit' | 'run' | 'build'
}
type Group = { title: string; steps: Step[] }
type Receipt = { at: string; state: State; reason: string | null; reference: string | null; source: 'manual' }
type Run = { id: string; version: string; createdAt: string; build: string | null; steps: Record<string, Receipt[]> }
type Project = { id: string; title: string; repository: string; directory: string; bundleId?: string; revision: number; setup: Group[]; setupProgress: Record<string, Receipt[]>; release: Group[]; runs: Run[] }
type Observation = { project: string; step: string; state: 'working' | 'pending'; date: string; source: 'owner-report' }
type Delivery = { projects: Project[]; observations: Observation[]; reasons: Record<string, string> }
type Write = { action: 'start'; version: string } | { action: 'record'; scope: Scope; runId: string | null; step: string; state: State; reason: string | null; reference: string | null; confirmed: boolean }
const time = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' })
const referenceLabels = { commit: 'Git 提交 SHA', run: 'Actions 运行编号', build: 'Apple 构建号' }
const buildPrior: Record<string, string> = { processing: 'upload', distributed: 'processing', device: 'distributed', 'store-review': 'device', 'store-live': 'store-review' }
const flatten = (groups: Group[]) => groups.flatMap(g => g.steps)
const Status = ({ state }: { state: State }) => <span className="ops-module-status" data-state={{ confirmed: 'online', working: 'notice', blocked: 'critical', pending: 'unknown' }[state]}>{statusLabels[state]}</span>

function referenceLink(project: Project, step: Step, reference: string) {
  const repo = `https://github.com/${project.repository}`
  if (step.receipt === 'commit') return `${repo}/commit/${reference}`
  if (step.receipt === 'run') return `${repo}/actions/runs/${reference}`
  return null
}

function RecordForm({ step, scope, run, previous, observation, reasons, saving, disabled, onSave }: {
  step: Step; scope: Scope; run?: Run; previous?: Receipt; observation?: Observation; reasons: Delivery['reasons']
  saving: boolean; disabled: boolean; onSave: (body: Write) => Promise<boolean>
}) {
  const [state, setState] = useState<State>(previous?.state ?? observation?.state ?? 'pending')
  const [reason, setReason] = useState(previous?.reason ?? '')
  const [reference, setReference] = useState(previous?.reference ?? (step.receipt === 'build' ? run?.build ?? '' : ''))
  const [confirmed, setConfirmed] = useState(false)
  return <form className="ops-delivery-form" onSubmit={event => {
    event.preventDefault()
    void onSave({ action: 'record', scope, runId: scope === 'release' ? run!.id : null, step: step.id, state,
      reason: state === 'blocked' ? reason : null, reference: reference.trim() || null, confirmed: state === 'confirmed' && confirmed }).then(ok => { if (ok) setConfirmed(false) })
  }}>
    <h3>登记进度</h3>
    <div className="ops-delivery-form-fields">
      <label>本节点状态<select value={state} onChange={e => { setState(e.target.value as State); setConfirmed(false) }} disabled={disabled || saving}>
        {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {state === 'blocked' && <label>卡住原因<select required value={reason} onChange={e => setReason(e.target.value)} disabled={disabled || saving}>
        <option value="">选择原因</option>{Object.entries(reasons).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>}
      {step.receipt && <label>{referenceLabels[step.receipt]}<input type="text" autoComplete="off" spellCheck={false} maxLength={step.receipt === 'commit' ? 40 : 24}
        required={state === 'confirmed'} disabled={disabled || saving} value={reference} onChange={e => setReference(e.target.value)} /></label>}
    </div>
    {state === 'confirmed' && <label className="ops-delivery-confirm"><input type="checkbox" checked={confirmed} required disabled={disabled || saving} onChange={e => setConfirmed(e.target.checked)} /> 我已核对上方的完成标准和实际回执</label>}
    <HohoButton type="submit" loading={saving} disabled={disabled}>保存节点</HohoButton>
  </form>
}

export function OpsDeliveryWorkflow() {
  const { data, setData, error, loading, reload, token } = useResource<Delivery>(endpoint)
  const [params, setParams] = useSearchParams()
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(''), [saved, setSaved] = useState('')
  const [newVersion, setNewVersion] = useState('')
  const lastAttempt = useRef<{ body: string; id: string } | null>(null)
  const header = useRef<HTMLHeadingElement>(null), follow = useRef(false)
  const requestedProject = params.get('deliveryProject')
  const project = data?.projects.find(p => p.id === requestedProject)
    ?? (!requestedProject ? data?.projects.find(p => data.observations.some(o => o.project === p.id && o.state === 'working')) ?? data?.projects[0] : undefined)
  const setupSteps = project ? flatten(project.setup) : []
  const releaseSteps = project ? flatten(project.release) : []
  const requestedRun = params.get('cycle')
  const run = requestedRun ? project?.runs.find(r => r.id === requestedRun) : project?.runs[0]
  const requestedStep = params.get('step')
  const observation = (id: string) => data?.observations.find(o => o.project === project?.id && o.step === id)
  const setupState = (id: string) => project?.setupProgress[id]?.at(-1)?.state ?? observation(id)?.state ?? 'pending'
  const releaseState = (id: string) => run?.steps[id]?.at(-1)?.state ?? 'pending'
  const blocked = setupSteps.find(step => setupState(step.id) === 'blocked') ?? releaseSteps.find(step => releaseState(step.id) === 'blocked')
  const working = setupSteps.find(step => setupState(step.id) === 'working') ?? releaseSteps.find(step => releaseState(step.id) === 'working')
  const current = blocked ?? working
  const selection = [...setupSteps, ...releaseSteps].find(s => s.id === requestedStep) ?? current ?? setupSteps[0]
  const scope = selection && releaseSteps.includes(selection) ? 'release' : 'setup'
  const history = selection ? (scope === 'setup' ? project?.setupProgress[selection.id] : run?.steps[selection.id]) : undefined
  const observed = selection && scope === 'setup' ? observation(selection.id) : undefined
  const receipt = history?.at(-1)
  const missingPrior = selection && scope === 'release' && run && buildPrior[selection.id] && releaseState(buildPrior[selection.id]) !== 'confirmed'
  const track = scope === 'setup' ? setupSteps : releaseSteps
  const nextStep = selection ? track[track.indexOf(selection) + 1] : undefined
  useEffect(() => {
    if (!follow.current || !selection) return
    follow.current = false
    header.current?.focus({ preventScroll: true })
    header.current?.scrollIntoView({ block: 'nearest' })
  }, [selection?.id, project?.id])

  function navigate(values: Record<string, string | null>, focus = false) {
    follow.current = focus
    setSaveError(''); setSaved('')
    setParams(previous => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(values)) if (value === null) next.delete(key); else next.set(key, value)
      return next
    }, { preventScrollReset: true })
    if (focus && values.step === selection?.id) {
      follow.current = false
      header.current?.focus({ preventScroll: true })
      header.current?.scrollIntoView({ block: 'nearest' })
    }
  }

  async function save(body: Write) {
    if (!project || saving || loading || error) return false
    const update = { ...body, project: project.id, revision: project.revision }
    const signature = JSON.stringify({ ...body, project: project.id })
    if (lastAttempt.current?.body !== signature) lastAttempt.current = { body: signature, id: crypto.randomUUID() }
    const requestId = lastAttempt.current.id
    setSaving(true); setSaveError(''); setSaved('')
    try {
      const result = await opsApiRequest<Delivery>(endpoint, { token, method: 'POST', body: { ...update, requestId } })
      setData(result); lastAttempt.current = null
      if (body.action === 'start') {
        setNewVersion('')
        navigate({ deliveryProject: project.id, cycle: requestId, step: 'scope' }, true)
      }
      setSaved(body.action === 'start' ? '已保存新一轮交付。' : '节点进度已保存。')
      return true
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : '没有确认保存成功，请重试。')
      if (cause instanceof ApiRequestError && cause.code === 'DELIVERY_REVISION_CONFLICT') reload()
      return false
    } finally { setSaving(false) }
  }

  return <section className="ops-delivery" aria-label="开发与交付">
    <header className="ops-delivery-intro"><div><h2>开发与交付</h2><p>从权限配置到安装验收。点开节点，查看入口、完成标准和卡住后的排查方法。</p></div><HohoButton variant="secondary" loading={loading} disabled={saving} onClick={reload}>刷新进度</HohoButton></header>
    {error && <p role="alert" className="ops-error">进度读取失败。{data ? '下方是上次读到的记录；请刷新后再登记。' : '请重试。'}</p>}
    {!data && loading && <p role="status">正在读取项目工作流…</p>}
    {data && <>
      <nav className="ops-delivery-projects" aria-label="交付项目">
        {data.projects.map(item => <HohoButton key={item.id} variant={project?.id === item.id ? 'primary' : 'secondary'} aria-pressed={project?.id === item.id}
          disabled={saving} onClick={() => { setNewVersion(''); navigate({ deliveryProject: item.id, cycle: null, step: null }) }}>{item.title}</HohoButton>)}
      </nav>
      {!project && <p className="ops-module-muted">这个项目未接入交付工作流。请选择上方已接入的项目。</p>}
      {project && <>
        <div className="ops-delivery-checkpoint">
          <div><strong>{project.title}</strong><p><a href={`https://github.com/${project.repository}`} target="_blank" rel="noreferrer">{project.repository} ↗</a>{project.bundleId && <> · <code>{project.bundleId}</code></>}</p></div>
          <div><small>{blocked ? '当前阻塞' : working ? '当前进行中' : '进度依据'}</small>
            {current ? <button type="button" disabled={saving} onClick={() => navigate({ step: current.id }, true)}>{current.title} →</button> : <p>手动登记，以原平台回执为准</p>}</div>
        </div>
        <div className="ops-delivery-round">
          <label>iOS 交付轮次<select value={run?.id ?? ''} disabled={saving} onChange={e => navigate({ cycle: e.target.value || null, step: e.target.value ? 'scope' : null })}>
            {!run && <option value="">{requestedRun ? '未找到该轮交付' : '尚未开始'}</option>}
            {project.runs.map(r => <option key={r.id} value={r.id}>{r.version}{r.build ? ` (${r.build})` : ''} · {time.format(new Date(r.createdAt))}</option>)}
          </select></label>
          <form onSubmit={e => { e.preventDefault(); void save({ action: 'start', version: newVersion.trim() }) }}>
            <label>计划版本号<input type="text" placeholder="例如 1.0.0" value={newVersion} maxLength={12} required autoComplete="off" disabled={saving}
              onChange={e => setNewVersion(e.target.value)} /></label>
            <HohoButton variant="secondary" type="submit" loading={saving} disabled={loading || Boolean(error)}>新建交付轮次</HohoButton>
          </form>
          <p>长期配置随项目保留；新构建另开一轮，避免沿用旧包回执。</p>
        </div>
        {(saved || saveError) && <p className={saveError ? 'ops-error' : 'ops-delivery-saved'} role={saveError ? 'alert' : 'status'}>{saveError || saved}</p>}
        <div className="ops-delivery-layout">
          <div className="ops-delivery-index">
            {(['setup', 'release'] as const).map(section => <section key={section} aria-label={section === 'setup' ? '长期配置' : '本轮交付'}>
              <h3>{section === 'setup' ? '长期配置' : '本轮交付'}</h3>
              {project[section].map(group => <div className="ops-delivery-group" key={group.title}><h4>{group.title}</h4><ol>
                {group.steps.map(step => <li key={step.id}><button type="button" className="ops-delivery-step" aria-pressed={step.id === selection?.id} disabled={saving}
                  onClick={() => navigate({ step: step.id }, true)}><span>{step.title}</span><Status state={section === 'setup' ? setupState(step.id) : releaseState(step.id)} /></button></li>)}
              </ol></div>)}
            </section>)}
          </div>
          {selection && <article className="ops-module-card ops-delivery-detail" aria-label="交付节点详情">
            <header><div><small>{scope === 'setup' ? '长期配置' : `本轮交付${run ? ` · ${run.version}` : ''}`}</small><h2 ref={header} tabIndex={-1}>{selection.title}</h2></div><Status state={receipt?.state ?? observed?.state ?? 'pending'} /></header>
            {receipt ? <p className="ops-delivery-source">手动登记 · <time dateTime={receipt.at}>{time.format(new Date(receipt.at))}</time>{receipt.reason && <> · {data.reasons[receipt.reason]}</>}
              {receipt.reference && <> · {referenceLink(project, selection, receipt.reference) ? <a href={referenceLink(project, selection, receipt.reference)!} target="_blank" rel="noreferrer">{receipt.reference} ↗</a> : <code>{receipt.reference}</code>}</>}</p>
              : observed && <p className="ops-delivery-source">{observed.date} · 负责人说明正在操作，平台结果待核验。</p>}
            <dl className="ops-delivery-instructions">
              <div><dt>去哪里操作</dt><dd>{selection.location}</dd></div>
              <div><dt>怎样才算完成</dt><dd>{selection.check}</dd></div>
              <div><dt>卡住先查什么</dt><dd>{selection.recovery}</dd></div>
            </dl>
            {selection.fields && <ul className="ops-delivery-fields" aria-label="填写位置对照">{selection.fields.map(field => <li key={field.name}><code>{field.name}</code><span>{field.source} → {field.destination}</span></li>)}</ul>}
            {selection.links && <nav className="ops-delivery-links" aria-label="平台入口">{selection.links.map(item => <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label} ↗</a>)}</nav>}
            {selection.related && <nav className="ops-delivery-links" aria-label="关联配置节点">{selection.related.map(id => <button key={id} type="button" disabled={saving} onClick={() => navigate({ step: id }, true)}>{setupSteps.find(s => s.id === id)?.title} →</button>)}</nav>}
            {nextStep && <nav className="ops-delivery-links" aria-label="继续查看交付节点"><button type="button" disabled={saving} onClick={() => navigate({ step: nextStep.id }, true)}>下一环：{nextStep.title} →</button></nav>}
            {missingPrior && <p className="ops-delivery-source">上一环「{releaseSteps.find(s => s.id === buildPrior[selection.id])?.title}」待核对。</p>}
            {scope === 'release' && !run ? <p className="ops-module-muted">可先看操作说明；登记回执前请新建或选择一轮交付。</p>
              : <RecordForm key={`${project.id}:${selection.id}:${run?.id ?? ''}`} step={selection} scope={scope} run={run} previous={receipt} observation={observed}
                reasons={data.reasons} saving={saving} disabled={loading || Boolean(error)} onSave={save} />}
            {!!history?.length && <details className="ops-delivery-history"><summary>变更记录（{history.length}）</summary><ol>
              {history.slice().reverse().map((item, index) => <li key={index}><time dateTime={item.at}>{time.format(new Date(item.at))}</time> · {statusLabels[item.state]}{item.reason && <> · {data.reasons[item.reason]}</>}{item.reference && <> · <code>{item.reference}</code></>}</li>)}
            </ol></details>}
          </article>}
        </div>
      </>}
    </>}
  </section>
}
