import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Bug, Check, ChevronDown, ChevronRight, CircleHelp, FileCheck2, Flower2, Leaf, Link2, LoaderCircle, Paperclip, Pill, Plus, Search, Sparkles, Trash2, Utensils, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/common'
import {
  allergyCategoryExamples, allergyCategoryLabels, allergyOptions, allergyReactionSummary,
  allergyStatusLabels, allergyTestResultLabel, allergyTestTypes, appendUniqueAllergyItems,
  buildTemporalStatement, createAllergyItem, createUnknownAllergyItem, formatAllergyDate,
  formatElapsedSince, readAllergyItems, testSupportsNumericValue, testSupportsStructuredResult,
  type AllergyCategory, type AllergyHistoryItem, type AllergyReactionRecord, type AllergyStatus,
  type AllergyTestRecord
} from '../../features/health-profile/utils/allergyProfile'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { healthEventService } from '../../services/healthEvents'
import { readProfileSection, saveProfileSection } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import type { HealthEventApiDto, Member } from '../../types'

const categories: { id: AllergyCategory; icon: typeof Utensils }[] = [
  { id: 'food', icon: Utensils }, { id: 'drug', icon: Pill }, { id: 'environment', icon: Leaf },
  { id: 'insect', icon: Bug }, { id: 'contact', icon: Flower2 }, { id: 'unknown', icon: CircleHelp }
]
const nowLocal = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16) }
const itemPath = (id: string) => `/health-profile/allergy/${id}`

function Header({ title, parent }: { title: string; parent: string }) {
  const navigate = useNavigate(), locked = useRef(false)
  return <header className="allergy-header"><button aria-label="返回" onClick={() => { if (locked.current) return; locked.current = true; navigate(parent, { replace: true }) }} type="button"><ArrowLeft size={21} /></button><strong>{title}</strong><span /></header>
}

function Identity({ member, compact = false }: { member: Member; compact?: boolean }) {
  return <div className={`allergy-identity${compact ? ' allergy-identity--compact' : ''}`}><Avatar name={member.name} size={compact ? 'sm' : 'md'} src={member.avatar} /><span><strong>{member.name}</strong>{!compact && <small>{member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : '未填写'} · {member.age}</small>}</span>{compact && <small>当前记录对象</small>}</div>
}

function Toast({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="allergy-toast" role="status"><Check size={18} /><span>{children}</span><button aria-label="关闭提示" onClick={onClose} type="button"><X size={16} /></button></div>
}

function PrimaryButton({ children, disabled = false, loading = false, onClick, type = 'button' }: { children: ReactNode; disabled?: boolean; loading?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return <button className="allergy-primary" disabled={disabled || loading} onClick={onClick} type={type}>{loading && <LoaderCircle className="animate-spin" size={17} />}{children}</button>
}

function InlineError({ message }: { message: string }) { return message ? <p className="allergy-error" role="alert"><AlertCircle size={16} />{message}</p> : null }

export function AllergyHistoryPage() {
  const member = useCurrentMember()
  return <AllergyProfilePage member={member} storageKey={`hoho-health-profile:${member.id}:allergy`} />
}

export function AllergyProfilePage({ member, storageKey }: { member: Member; storageKey: string }) {
  const navigate = useNavigate(), location = useLocation()
  const accountId = useAppStore(state => state.authUser?.id ?? '')
  const token = useAppStore(state => state.authToken)
  const [items, setItems] = useState(() => readAllergyItems(readProfileSection(storageKey), member.id, accountId))
  const [events, setEvents] = useState<HealthEventApiDto[]>([])
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const parts = location.pathname.split('/').filter(Boolean), sub = parts.slice(2)
  const item = items.find(candidate => candidate.id === sub[0] && candidate.memberId === member.id && (!accountId || !candidate.accountId || candidate.accountId === accountId))

  useEffect(() => { setItems(readAllergyItems(readProfileSection(storageKey), member.id, accountId)); setError('') }, [accountId, member.id, storageKey])
  useEffect(() => {
    if (!token) { setEvents([]); return }
    const controller = new AbortController()
    healthEventService.list(token, controller.signal).then(data => setEvents(data.filter(event => event.memberId === member.id))).catch(() => setEvents([]))
    return () => controller.abort()
  }, [member.id, token])

  const persist = async (next: AllergyHistoryItem[]) => {
    setSaving(true); setError('')
    try { await saveProfileSection(storageKey, next); setItems(next); return true }
    catch { setError('保存失败，请检查网络后重试'); return false }
    finally { setSaving(false) }
  }
  const update = async (id: string, change: (current: AllergyHistoryItem) => AllergyHistoryItem) => persist(items.map(candidate => candidate.id === id ? change(candidate) : candidate))

  if (sub[0] === 'new' && sub[1] && sub[1] !== 'unknown') {
    const category = sub[1] as AllergyCategory
    return <SelectPage accountId={accountId} category={category} error={error} items={items} member={member} saving={saving} onOpenExisting={id => navigate(itemPath(id))} onSave={async names => {
      const additions = names.map(name => createAllergyItem(member.id, category, name, accountId))
      const next = appendUniqueAllergyItems(items, additions), addedItems = next.slice(items.length)
      if (await persist(next)) navigate('/health-profile/allergy', { replace: true, state: { notice: `已为${member.name}添加 ${addedItems.length} 条相关信息` } })
    }} />
  }

  if (sub[0] === 'choose') return <CategoryPage existing parent="/health-profile/allergy" member={member} saving={saving} onUnknown={async () => {
    const unknown = createUnknownAllergyItem(member.id, accountId)
    if (await persist([...items, unknown])) navigate(`${itemPath(unknown.id)}/reaction`, { replace: true })
  }} />

  if (item && sub[1] === 'status') return <StatusPage error={error} item={item} member={member} saving={saving} onSave={async changes => {
    if (await update(item.id, current => ({ ...current, ...changes, updatedAt: new Date().toISOString(), statusUpdatedAt: new Date().toISOString() }))) navigate(itemPath(item.id), { replace: true, state: { notice: `已保存${member.name}的当前状态` } })
  }} />

  if (item && sub[1] === 'reaction' && sub.length === 2) return <ReactionPage error={error} item={item} member={member} saving={saving} onSave={async reaction => {
    if (await update(item.id, current => ({ ...current, reactions: [...current.reactions, reaction], lastReactionAt: reaction.occurredAt, updatedAt: new Date().toISOString() }))) navigate(itemPath(item.id), { replace: true, state: { notice: `已保存${member.name}的一次症状记录` } })
  }} />

  if (item && sub[1] === 'reactions' && sub[2]) return <ReactionDetail item={item} member={member} reaction={item.reactions.find(record => record.id === sub[2] && record.memberId === member.id)} />

  if (item && sub[1] === 'test' && sub.length === 2) return <TestPage error={error} item={item} member={member} saving={saving} onSave={async testRecord => {
    if (await update(item.id, current => ({ ...current, tests: [...current.tests, testRecord], updatedAt: new Date().toISOString() }))) navigate(itemPath(item.id), { replace: true, state: { notice: `已保存${member.name}的一份检查记录` } })
  }} />

  if (item && sub[1] === 'tests' && sub[2]) return <TestDetail item={item} member={member} testRecord={item.tests.find(record => record.id === sub[2] && record.memberId === member.id)} />
  if (item) return <DetailPage error={error} events={events} item={item} member={member} onUpdate={update} saving={saving} />
  if (sub.length > 0 && sub[0] !== 'choose') return <MissingItem member={member} />
  if (items.length) return <Dashboard items={items} member={member} />
  return <CategoryPage member={member} parent="/health-profile" saving={saving} onUnknown={async () => {
    const unknown = createUnknownAllergyItem(member.id, accountId)
    if (await persist([unknown])) navigate(`${itemPath(unknown.id)}/reaction`, { replace: true })
  }} />
}

function CategoryPage({ existing = false, member, onUnknown, parent, saving }: { existing?: boolean; member: Member; onUnknown: () => void; parent: string; saving: boolean }) {
  const navigate = useNavigate(), timer = useRef<number>(), [active, setActive] = useState<AllergyCategory>()
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const open = (id: AllergyCategory) => {
    if (saving || active) return
    if (id === 'unknown') { setActive(id); void onUnknown(); return }
    const destination = `/health-profile/allergy/new/${id}`
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { navigate(destination); return }
    setActive(id); timer.current = window.setTimeout(() => navigate(destination), 200)
  }
  return <main className="app-shell allergy-shell"><Header parent={parent} title="过敏与反应记录" /><div className="allergy-content allergy-first-entry"><Identity member={member} /><div className="allergy-intro"><h1>{existing ? '添加相关信息' : '请记下你知道的过敏信息'}</h1><p>已经明确的、正在怀疑的，都可以先记下来。</p></div><div className="allergy-category-grid">{categories.map(({ id, icon: Icon }) => <button aria-pressed={active === id} key={id} onClick={() => open(id)} type="button"><Icon /><span><strong>{allergyCategoryLabels[id]}</strong><small>{allergyCategoryExamples[id]}</small></span>{active === id && saving && <LoaderCircle className="animate-spin" size={16} />}</button>)}</div><p className="allergy-recall"><Sparkles size={16} />想不起名字也没关系，可以先选“尚未明确”。</p></div></main>
}

function SelectPage({ category, error, items, member, saving, onOpenExisting, onSave }: { accountId: string; category: AllergyCategory; error: string; items: AllergyHistoryItem[]; member: Member; saving: boolean; onOpenExisting: (id: string) => void; onSave: (names: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]), [custom, setCustom] = useState(''), [search, setSearch] = useState(''), [message, setMessage] = useState('')
  const options = allergyOptions[category].filter(option => option.includes(search.trim()))
  const chosen = [...selected, ...(custom.trim() ? [custom.trim()] : [])]
  const duplicateFor = (name: string) => items.find(item => item.category === category && item.name === name)
  const chooseOption = (name: string) => {
    const duplicate = duplicateFor(name)
    if (duplicate) {
      if (chosen.length) { setMessage('请先保存当前已选项目，再查看已有记录。'); return }
      onOpenExisting(duplicate.id); return
    }
    setMessage(''); setSelected(values => values.includes(name) ? values.filter(value => value !== name) : [...values, name])
  }
  return <main className="app-shell allergy-shell"><Header parent="/health-profile/allergy/choose" title={`添加${allergyCategoryLabels[category]}相关信息`} /><div className="allergy-content allergy-content--with-action"><Identity member={member} /><header className="allergy-selection-title"><span><strong>点选你知道或关切的{allergyCategoryLabels[category]}</strong><small>只需点选，之后还能继续补充。</small></span><em aria-live="polite">已选 {chosen.length} 项</em></header>{category !== 'food' && <label className="allergy-search"><Search size={17} /><input aria-label={`搜索${allergyCategoryLabels[category]}`} onChange={event => setSearch(event.target.value)} placeholder={`搜索${allergyCategoryLabels[category]}`} value={search} /></label>}<div className="allergy-option-grid">{options.map(name => { const selectedNow = selected.includes(name), duplicate = duplicateFor(name); return <button aria-label={duplicate ? `${name}，已记录，查看或继续补充` : name} aria-pressed={selectedNow} key={name} onClick={() => chooseOption(name)} type="button"><span>{name}</span>{selectedNow && <Check size={17} />}{duplicate && <small>查看／继续补充</small>}</button> })}</div><label className="allergy-custom"><Plus size={18} /><input onChange={event => setCustom(event.target.value)} placeholder={`其他${allergyCategoryLabels[category]}或自定义名称`} value={custom} /></label>{message && <p className="allergy-info" role="status"><AlertCircle size={16} />{message}</p>}<InlineError message={error} /></div><div className="allergy-action"><PrimaryButton disabled={!chosen.length} loading={saving} onClick={() => onSave(chosen)}>添加相关信息{chosen.length ? `（${chosen.length}）` : ''}</PrimaryButton></div></main>
}

function Dashboard({ items, member }: { items: AllergyHistoryItem[]; member: Member }) {
  const navigate = useNavigate(), location = useLocation(), notice = (location.state as { notice?: string } | null)?.notice
  const grouped = categories.map(category => ({ ...category, items: items.filter(item => item.category === category.id) })).filter(group => group.items.length)
  const closeNotice = () => navigate(location.pathname, { replace: true, state: null })
  return <main className="app-shell allergy-shell"><Header parent="/health-profile" title="过敏与反应记录" /><div className="allergy-content"><Identity member={member} /><p className="allergy-panel-note">这里记录的是目前知道的信息，不需要一次填完整。</p><button className="allergy-add allergy-add--primary-position" onClick={() => navigate('/health-profile/allergy/choose')} type="button"><Plus />添加相关信息</button><div className="allergy-groups">{grouped.map(group => <section key={group.id}><header><group.icon size={20} /><strong>{allergyCategoryLabels[group.id]}（{group.items.length}）</strong></header>{group.items.map(item => <button key={item.id} onClick={() => navigate(itemPath(item.id))} type="button"><span><strong>{item.name}</strong>{item.currentStatus && <em>{allergyStatusLabels[item.currentStatus as Exclude<AllergyStatus, ''>]}</em>}<small>症状 {item.reactions.length}　检查 {item.tests.length}　医生判断 {item.clinicianNote ? '已补充' : '未补充'}</small></span><ChevronRight size={18} /></button>)}</section>)}</div><p className="allergy-recall"><Sparkles size={16} />最近有没有接触某个对象后反复不舒服？<button onClick={() => navigate('/health-profile/allergy/choose')} type="button">想到一个</button></p></div>{notice && <Toast onClose={closeNotice}>{notice}</Toast>}</main>
}

function DetailPage({ error, events, item, member, onUpdate, saving }: { error: string; events: HealthEventApiDto[]; item: AllergyHistoryItem; member: Member; onUpdate: (id: string, change: (item: AllergyHistoryItem) => AllergyHistoryItem) => Promise<boolean>; saving: boolean }) {
  const navigate = useNavigate(), location = useLocation(), notice = (location.state as { notice?: string } | null)?.notice
  const candidates = useMemo(() => events.filter(event => !item.evidenceLinks.some(link => link.healthEventId === event.id) && (event.title.includes(item.name) || event.eventSummary?.displayedResult.summary?.includes(item.name) || event.category === 'allergy')).slice(0, 3), [events, item])
  const [removed, setRemoved] = useState<string[]>([]), visible = candidates.filter(event => !removed.includes(event.id))
  const reactions = [...item.reactions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const tests = [...item.tests].sort((a, b) => b.testedAt.localeCompare(a.testedAt))
  const closeNotice = () => navigate(location.pathname, { replace: true, state: null })
  return <main className="app-shell allergy-shell"><Header parent="/health-profile/allergy" title={`${item.name}的相关记录`} /><div className="allergy-content"><Identity compact member={member} /><section className="allergy-detail-hero"><span><strong>{item.name}</strong><small>{allergyCategoryLabels[item.category]}{item.currentStatus ? ` · ${allergyStatusLabels[item.currentStatus as Exclude<AllergyStatus, ''>]}` : ''}</small></span><button onClick={() => navigate(`${itemPath(item.id)}/status`)} type="button">编辑</button></section><div className="allergy-stats"><span><strong>{item.reactions.length}</strong>次症状</span><span><strong>{item.tests.length}</strong>份检查</span>{item.currentStatus && <span><strong>{allergyStatusLabels[item.currentStatus as Exclude<AllergyStatus, ''>]}</strong>当前状态</span>}<span><strong>{formatAllergyDate(item.updatedAt).replace(/\d{4}年/, '')}</strong>最近更新</span></div><div className="allergy-detail-actions"><button onClick={() => navigate(`${itemPath(item.id)}/reaction`)} type="button">记录一次症状<ChevronRight /></button><button onClick={() => navigate(`${itemPath(item.id)}/test`)} type="button">添加检查或报告<ChevronRight /></button><button onClick={() => navigate(`${itemPath(item.id)}/status`)} type="button">补充医生判断<ChevronRight /></button></div>{reactions.length > 0 && <RecordSection title={`症状记录（${reactions.length}）`}>{reactions.map(record => <button className="allergy-record-row" key={record.id} onClick={() => navigate(`${itemPath(item.id)}/reactions/${record.id}`)} type="button"><span><strong>{allergyReactionSummary(record)}</strong><small>{formatAllergyDate(record.occurredAt)} · 接触后{record.latency || '时间未说明'}</small></span><ChevronRight size={17} /></button>)}</RecordSection>}{tests.length > 0 && <RecordSection title={`检查与报告（${tests.length}）`}>{tests.map(record => <button className="allergy-record-row" key={record.id} onClick={() => navigate(`${itemPath(item.id)}/tests/${record.id}`)} type="button"><span><strong>{record.testType || '检查类型未填写'} · {allergyTestResultLabel(record.result)}</strong><small>{formatAllergyDate(record.testedAt)} · {record.reportFiles.length ? `已上传 ${record.reportFiles.length} 份附件` : '未上传附件'}</small></span><ChevronRight size={17} /></button>)}</RecordSection>}{visible.length > 0 && <section className="allergy-candidates"><h2><Link2 />找到了{visible.length}条可能相关的记录</h2><p>这些记录只表示时间或内容上可能相关，不代表因果关系。</p>{visible.map(event => <article key={event.id}><span><strong>{event.title}</strong><small>{formatAllergyDate(event.startTime)} · 自动发现</small></span><button onClick={() => setRemoved(values => [...values, event.id])} type="button">移除</button></article>)}<PrimaryButton loading={saving} onClick={async () => { const timestamp = Date.now(); const links = visible.map(event => ({ id: `link-${timestamp}-${event.id}`, allergyItemId: item.id, healthEventId: event.id, relationType: 'keyword' as const, confidence: .6, source: 'rule' as const, confirmedByUser: true, createdAt: new Date().toISOString() })); if (await onUpdate(item.id, current => ({ ...current, evidenceLinks: [...current.evidenceLinks, ...links], updatedAt: new Date().toISOString() }))) navigate(itemPath(item.id), { replace: true, state: { notice: `已为${member.name}关联相关健康随记` } }) }}>确认关联</PrimaryButton><button className="allergy-secondary" onClick={() => navigate('/health-events', { state: { allergyItemId: item.id, returnTo: itemPath(item.id) } })} type="button">手动关联其他记录</button></section>}{item.evidenceLinks.length > 0 && <section className="allergy-clue"><Check /><span><strong>已关联相关健康随记</strong><small>{buildTemporalStatement(item.name, `接触${item.name}`, '相关表现')}</small></span></section>}<InlineError message={error} /></div>{notice && <Toast onClose={closeNotice}>{notice}</Toast>}</main>
}

function RecordSection({ children, title }: { children: ReactNode; title: string }) { return <section className="allergy-record-section"><h2>{title}</h2><div>{children}</div></section> }

function StatusPage({ error, item, member, saving, onSave }: { error: string; item: AllergyHistoryItem; member: Member; saving: boolean; onSave: (changes: Partial<AllergyHistoryItem>) => void }) {
  const [status, setStatus] = useState<AllergyStatus>(item.currentStatus), [date, setDate] = useState(item.excludedAt ?? item.toleranceSince ?? ''), [clinician, setClinician] = useState(item.clinician ?? ''), [note, setNote] = useState(item.clinicianNote ?? '')
  const choices: Exclude<AllergyStatus, ''>[] = ['suspected', 'investigating', 'confirmed', 'excluded', 'tolerated']
  return <main className="app-shell allergy-shell"><Header parent={itemPath(item.id)} title="当前状态与医生判断" /><form className="allergy-content allergy-form" onSubmit={event => { event.preventDefault(); onSave({ currentStatus: status, excludedAt: status === 'excluded' ? date : undefined, toleranceSince: status === 'tolerated' ? date : undefined, clinician, clinicianNote: note }) }}><Identity compact member={member} /><fieldset className="allergy-status-grid"><legend>选择当前状态</legend>{choices.map(value => <button aria-pressed={status === value} key={value} onClick={() => setStatus(value)} type="button"><Check /><strong>{allergyStatusLabels[value]}</strong></button>)}</fieldset><div className="allergy-extra-fields">{['confirmed', 'excluded', 'tolerated'].includes(status) && <label>{status === 'excluded' ? '排除日期' : status === 'tolerated' ? '当前耐受开始时间' : '确认日期'}<input max={new Date().toISOString().slice(0, 10)} onChange={event => setDate(event.target.value)} required type="date" value={date} /></label>}<label>医院或医生（选填）<input onChange={event => setClinician(event.target.value)} value={clinician} /></label><label>医生判断或说明（选填）<textarea onChange={event => setNote(event.target.value)} value={note} /></label>{status === 'excluded' && date && <p>目前已排除：{formatElapsedSince(date)}</p>}</div><p className="allergy-info"><AlertCircle size={16} />状态仅记录当前掌握的信息，之后仍可重新评估。</p><InlineError message={error} /><PrimaryButton disabled={!status} loading={saving} type="submit">保存状态</PrimaryButton></form></main>
}

function ReactionPage({ error, item, member, saving, onSave }: { error: string; item: AllergyHistoryItem; member: Member; saving: boolean; onSave: (record: AllergyReactionRecord) => void }) {
  const [systems, setSystems] = useState<string[]>([]), [latency, setLatency] = useState(''), [more, setMore] = useState(false), [occurredAt, setOccurredAt] = useState(nowLocal())
  const [details, setDetails] = useState({ symptoms: '', exposureAmount: '', bodyLocations: '', handling: '', notes: '' })
  const toggle = (value: string) => setSystems(values => values.includes(value) ? values.filter(item => item !== value) : [...values, value])
  const updateDetail = (key: keyof typeof details, value: string) => setDetails(current => ({ ...current, [key]: value }))
  return <main className="app-shell allergy-shell"><Header parent={itemPath(item.id)} title="记录一次症状" /><form className="allergy-content allergy-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (!systems.length || !latency) return; onSave({ id: `reaction-${Date.now()}`, allergyItemId: item.id, memberId: member.id, symptomSystems: systems, symptoms: details.symptoms, exposureAmount: details.exposureAmount, latency, bodyLocations: details.bodyLocations, handling: details.handling, aggravatingFactors: '', relievingFactors: '', occurredAt: new Date(occurredAt).toISOString(), photos: [], notes: details.notes }) }}><Identity compact member={member} /><div className="allergy-detail-hero"><span><strong>{item.name} · {allergyCategoryLabels[item.category]}</strong><small>正在记录与该对象相关的症状</small></span></div><Choice required title="出现了哪些表现？" options={['皮肤', '消化道', '呼吸道', '口腔／面部', '全身', '其他']} selected={systems} onToggle={toggle} /><label className="allergy-text-field">具体表现（选填）<textarea onChange={event => updateDetail('symptoms', event.target.value)} placeholder="例如：嘴角发红，持续约半小时" rows={3} value={details.symptoms} /><small>可以用自己的话记录，之后回看会保留原文。</small></label><Choice required title="接触后多久出现？" options={['立即', '2小时内', '当天稍后', '说不清']} selected={[latency]} onToggle={setLatency} /><button aria-expanded={more} className="allergy-more-fields" onClick={() => setMore(value => !value)} type="button">更多信息：接触量、身体部位和处理经过 <ChevronDown /></button>{more && <div className="allergy-extra-fields"><label>接触量（选填）<input onChange={event => updateDetail('exposureAmount', event.target.value)} value={details.exposureAmount} /></label><label>身体部位（选填）<input onChange={event => updateDetail('bodyLocations', event.target.value)} value={details.bodyLocations} /></label><label>处理经过（选填）<textarea onChange={event => updateDetail('handling', event.target.value)} value={details.handling} /></label><label>备注（选填）<textarea onChange={event => updateDetail('notes', event.target.value)} value={details.notes} /></label></div>}<label className="allergy-date-field">发生时间<input max={nowLocal()} onChange={event => setOccurredAt(event.target.value)} required type="datetime-local" value={occurredAt} /></label>{systems.length > 0 && latency && <p className="allergy-save-preview"><Check />已记清：{systems.join('、')} · 接触后{latency}<small>这段经过会保存到{member.name}的相关对象详情。</small></p>}<p className="allergy-required-help">标有“必选”的两项是保存所需的最低信息；时间不确定可选“说不清”。</p><InlineError message={error} /><PrimaryButton disabled={!systems.length || !latency} loading={saving} type="submit">保存这次症状</PrimaryButton></form></main>
}

function Choice({ onToggle, options, required = false, selected, title }: { onToggle: (value: string) => void; options: string[]; required?: boolean; selected: string[]; title: string }) {
  return <fieldset aria-required={required} className="allergy-choice"><legend>{title}{required && <em>必选</em>}</legend><div>{options.map(value => <button aria-pressed={selected.includes(value)} key={value} onClick={() => onToggle(value)} type="button">{value}{selected.includes(value) && <Check />}</button>)}</div></fieldset>
}

function ReactionDetail({ item, member, reaction }: { item: AllergyHistoryItem; member: Member; reaction?: AllergyReactionRecord }) {
  if (!reaction) return <MissingRecord item={item} member={member} type="症状" />
  return <main className="app-shell allergy-shell"><Header parent={itemPath(item.id)} title="症状详情" /><div className="allergy-content"><Identity compact member={member} /><section className="allergy-detail-hero"><span><strong>{item.name} · {allergyCategoryLabels[item.category]}</strong><small>{formatAllergyDate(reaction.occurredAt)}</small></span></section><dl className="allergy-detail-list"><dt>表现类别</dt><dd>{reaction.symptomSystems.join('、') || '未补充'}</dd><dt>具体表现</dt><dd className="allergy-prewrap">{reaction.symptoms || '未补充'}</dd><dt>出现时间</dt><dd>接触后{reaction.latency || '未说明'}</dd>{reaction.exposureAmount && <><dt>接触量</dt><dd>{reaction.exposureAmount}</dd></>}{reaction.bodyLocations && <><dt>身体部位</dt><dd>{reaction.bodyLocations}</dd></>}{reaction.handling && <><dt>处理经过</dt><dd className="allergy-prewrap">{reaction.handling}</dd></>}{reaction.notes && <><dt>备注</dt><dd className="allergy-prewrap">{reaction.notes}</dd></>}</dl></div></main>
}

function TestPage({ error, item, member, saving, onSave }: { error: string; item: AllergyHistoryItem; member: Member; saving: boolean; onSave: (record: AllergyTestRecord) => void }) {
  const [type, setType] = useState(''), [result, setResult] = useState<AllergyTestRecord['result']>(''), [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [value, setValue] = useState(''), [unit, setUnit] = useState(''), [institution, setInstitution] = useState(''), [notes, setNotes] = useState(''), [more, setMore] = useState(false)
  const [files, setFiles] = useState<string[]>([]), [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState('')
  const structuredResult = testSupportsStructuredResult(type), numericValue = testSupportsNumericValue(type)
  const selectType = (next: string) => { setType(next); if (!testSupportsStructuredResult(next)) setResult(''); if (!testSupportsNumericValue(next)) { setValue(''); setUnit('') } }
  const upload = async (fileList: FileList | null) => {
    const chosen = Array.from(fileList ?? [])
    if (!chosen.length) return
    if (chosen.length > 3) { setUploadError('一次最多选择 3 份附件'); return }
    if (chosen.some(file => file.size > 4 * 1024 * 1024)) { setUploadError('单个附件不能超过 4MB'); return }
    if (chosen.some(file => !file.type.startsWith('image/') && file.type !== 'application/pdf')) { setUploadError('仅支持图片或 PDF'); return }
    setUploading(true); setUploadError('')
    try {
      const encoded = await Promise.all(chosen.map(file => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })))
      setFiles(encoded)
    } catch { setUploadError('附件读取失败，请重新选择') }
    finally { setUploading(false) }
  }
  return <main className="app-shell allergy-shell"><Header parent={itemPath(item.id)} title="添加检查或报告" /><form className="allergy-content allergy-form" onSubmit={(event: FormEvent) => { event.preventDefault(); onSave({ id: `test-${Date.now()}`, allergyItemId: item.id, memberId: member.id, testType: type, result: structuredResult ? result : '', value: numericValue ? value : '', unit: numericValue ? unit : '', testedAt: date, institution, reportFiles: files, clinicianInterpretation: '', notes }) }}><Identity compact member={member} /><div className="allergy-detail-hero"><span><strong>{item.name} · {allergyCategoryLabels[item.category]}</strong><small>为该相关对象保存检查或观察记录</small></span></div><Choice required title="做了什么检查或观察？" options={[...allergyTestTypes]} selected={[type]} onToggle={selectType} />{structuredResult && <Choice title="检查结果（选填）" options={['阳性', '阴性', '临界', '未填写']} selected={[({ positive: '阳性', negative: '阴性', borderline: '临界', '': '未填写' } as const)[result]]} onToggle={label => setResult(({ 阳性: 'positive', 阴性: 'negative', 临界: 'borderline', 未填写: '' } as const)[label] ?? '')} />}<label className="allergy-date-field">检查或观察时间<input max={new Date().toISOString().slice(0, 10)} onChange={event => setDate(event.target.value)} required type="date" value={date} /></label><section className="allergy-upload-panel"><strong>报告附件（选填）</strong><small>{uploading ? '正在读取…' : files.length ? `已选择 ${files.length} 份附件` : '未上传'}</small><label className="allergy-upload"><Paperclip size={16} />{files.length ? '替换附件' : '选择报告图片或 PDF'}<input accept="image/*,application/pdf" multiple onChange={event => void upload(event.target.files)} type="file" /></label>{files.length > 0 && <button className="allergy-remove-upload" onClick={() => setFiles([])} type="button"><Trash2 size={15} />移除附件</button>}{uploadError && <p role="alert">{uploadError}</p>}</section><button aria-expanded={more} className="allergy-more-fields" onClick={() => setMore(open => !open)} type="button">补充信息（选填）<ChevronDown /></button>{more && <div className="allergy-extra-fields">{numericValue && <><label>原始数值<input inputMode="decimal" onChange={event => setValue(event.target.value)} value={value} /></label><label>单位<input onChange={event => setUnit(event.target.value)} value={unit} /></label></>}<label>检查机构<input onChange={event => setInstitution(event.target.value)} value={institution} /></label><label>原始说明<textarea onChange={event => setNotes(event.target.value)} placeholder="按报告或当时观察如实记录" value={notes} /></label></div>}<InlineError message={error} /><PrimaryButton disabled={!type || uploading} loading={saving} type="submit">保存检查或观察</PrimaryButton><p className="allergy-footnote">系统只保存原始记录，不自动解释结果或修改当前判断。</p></form></main>
}

function TestDetail({ item, member, testRecord }: { item: AllergyHistoryItem; member: Member; testRecord?: AllergyTestRecord }) {
  const navigate = useNavigate()
  if (!testRecord) return <MissingRecord item={item} member={member} type="检查" />
  const structuredResult = testSupportsStructuredResult(testRecord.testType)
  return <main className="app-shell allergy-shell"><Header parent={itemPath(item.id)} title="检查详情" /><div className="allergy-content"><Identity compact member={member} /><div className="allergy-detail-hero"><span><strong>{item.name} · {testRecord.testType}</strong><small>原始记录已保存</small></span></div><section className="allergy-test-result"><FileCheck2 /><span><strong>{structuredResult ? `本次结果：${allergyTestResultLabel(testRecord.result)}` : '本次观察记录'}</strong><small>时间：{formatAllergyDate(testRecord.testedAt)}</small></span></section><dl className="allergy-detail-list">{testRecord.value && <><dt>原始数值</dt><dd>{testRecord.value}{testRecord.unit ? ` ${testRecord.unit}` : ''}</dd></>}{testRecord.institution && <><dt>检查机构</dt><dd>{testRecord.institution}</dd></>}{testRecord.notes && <><dt>原始说明</dt><dd className="allergy-prewrap">{testRecord.notes}</dd></>}<dt>报告附件</dt><dd>{testRecord.reportFiles.length ? `已上传 ${testRecord.reportFiles.length} 份` : '未上传／待补充'}</dd></dl><section className="allergy-current-status"><AlertCircle /><span><strong>当前状态：{item.currentStatus ? allergyStatusLabels[item.currentStatus as Exclude<AllergyStatus, ''>] : '未设置'}</strong><small>单次检查或观察记录不直接等于最终诊断。</small></span></section><PrimaryButton onClick={() => navigate(`${itemPath(item.id)}/status`)}>补充医生判断</PrimaryButton></div></main>
}

function MissingItem({ member }: { member: Member }) { return <main className="app-shell allergy-shell"><Header parent="/health-profile/allergy" title="相关记录" /><div className="allergy-content"><Identity compact member={member} /><p className="allergy-error" role="alert">没有找到属于当前家庭成员的这条记录。</p></div></main> }
function MissingRecord({ item, member, type }: { item: AllergyHistoryItem; member: Member; type: string }) { return <main className="app-shell allergy-shell"><Header parent={itemPath(item.id)} title={`${type}详情`} /><div className="allergy-content"><Identity compact member={member} /><p className="allergy-error" role="alert">没有找到这条{type}记录。</p></div></main> }
