import { ArrowLeft, Check, ChevronDown, Download, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheetSurface, HohoButton, HohoInput, StatusNotice } from '../../components/design-system'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { loadProfileSections, readProfileSection, saveProfileSection } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import { DietaryCardPanel, DietaryEmptyState, FoodGlyph } from './DietaryCardPanel'
import { downloadDietaryCard } from './dietaryCardExport'
import {
  createManualDietaryItem,
  deriveDietarySources,
  dietaryItemExists,
  emptyDietarySnapshot,
  foodIdFor,
  mergeDietarySources,
  normalizeFoodName,
  presentDietaryCard,
  readDietarySnapshot,
  snapshotFromSources,
  snapshotsEqual,
  type DietaryCardGroup,
  type DietaryCardItem,
  type DietaryCardLanguage,
  type DietaryCardSnapshot
} from './dietaryCardModel'
import './dietaryCard.css'

const sectionKey = (memberId: string) => `hoho-health-profile:${memberId}:dietary-card`
const allergyKey = (memberId: string) => `hoho-health-profile:${memberId}:allergy`

interface DietaryDataState {
  status: 'loading' | 'ready' | 'error'
  snapshot: DietaryCardSnapshot | null
  sourceCount: number
  error: string
}

function readDietaryData(memberId: string, accountId = '') {
  const sources = deriveDietarySources(readProfileSection(allergyKey(memberId)), memberId, accountId)
  const saved = readDietarySnapshot(readProfileSection(sectionKey(memberId)), memberId)
  return { snapshot: saved ?? snapshotFromSources(memberId, sources), saved, sources }
}

function useDietaryCardData() {
  const token = useAppStore((state) => state.authToken)
  const accountId = useAppStore((state) => state.authUser?.id ?? '')
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const members = useAppStore((state) => state.members)
  const requestRef = useRef(0)
  const [state, setState] = useState<DietaryDataState>({ status: 'loading', snapshot: null, sourceCount: 0, error: '' })

  const load = useCallback(async (keepVisible = true) => {
    const requestId = ++requestRef.current
    const memberId = currentMemberId
    const cached = readDietaryData(memberId, accountId)
    const cachedHasData = Boolean(cached.saved || cached.sources.length)
    setState((previous) => keepVisible && previous.snapshot && previous.snapshot.memberId === memberId
      ? { ...previous, error: '' }
      : cachedHasData
        ? { status: 'ready', snapshot: cached.snapshot, sourceCount: cached.sources.length, error: '' }
        : { status: 'loading', snapshot: null, sourceCount: 0, error: '' })
    if (!token || !members.some((member) => member.id === memberId)) {
      setState({ status: 'error', snapshot: null, sourceCount: 0, error: '请先在前台选择或添加家人' })
      return null
    }
    try {
      await loadProfileSections(token, members)
      if (requestId !== requestRef.current || useAppStore.getState().currentMemberId !== memberId) return null
      const latest = readDietaryData(memberId, accountId)
      setState({ status: 'ready', snapshot: latest.snapshot, sourceCount: latest.sources.length, error: '' })
      return latest
    } catch (error) {
      if (requestId !== requestRef.current) return null
      const message = error instanceof Error ? error.message : '读取失败，请重试'
      if (cachedHasData) setState({ status: 'ready', snapshot: cached.snapshot, sourceCount: cached.sources.length, error: message })
      else setState({ status: 'error', snapshot: null, sourceCount: 0, error: message || '读取失败，请重试' })
      return null
    }
  }, [accountId, currentMemberId, members, token])

  useEffect(() => { void load(false) }, [load])
  return { accountId, currentMemberId, members, setState, state, token, reload: load }
}

function DietaryHeader({ editing = false, memberName, onBack }: { editing?: boolean; memberName: string; onBack: () => void }) {
  return <header className="dietary-page-header"><button aria-label={editing ? '取消修改' : '返回前台'} onClick={onBack} type="button"><ArrowLeft /></button><div><h1>{editing ? '修改忌口清单' : '忌口出示卡'}</h1><p>当前：{memberName}</p></div><span aria-hidden="true" /></header>
}

export function DietaryCardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const member = useCurrentMember()
  const { accountId, currentMemberId, members, reload, setState, state, token } = useDietaryCardData()
  const [language, setLanguage] = useState<DietaryCardLanguage>('zh')
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState(() => (location.state as { notice?: string } | null)?.notice ?? '')

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  const snapshot = state.snapshot
  const presentation = snapshot ? presentDietaryCard(snapshot, language) : null
  const selectionEmpty = Boolean(snapshot?.items.length && !presentation?.visibleCount)

  const update = async () => {
    if (!snapshot || !token || refreshing) return
    const requestMemberId = currentMemberId
    setRefreshing(true)
    try {
      await loadProfileSections(token, members)
      if (useAppStore.getState().currentMemberId !== requestMemberId) return
      const sources = deriveDietarySources(readProfileSection(allergyKey(requestMemberId)), requestMemberId, accountId)
      const next = mergeDietarySources(snapshot, sources)
      const unchanged = snapshotsEqual(snapshot, next)
      await saveProfileSection(sectionKey(requestMemberId), [next])
      if (useAppStore.getState().currentMemberId !== requestMemberId) return
      setState({ status: 'ready', snapshot: next, sourceCount: sources.length, error: '' })
      setNotice(next.items.some((item) => item.needsReview) ? '来源有变化，请在修改中核对' : unchanged ? '已是最新' : '已更新')
    } catch { setNotice('更新失败，请重试') }
    finally { setRefreshing(false) }
  }

  const saveImage = async () => {
    if (!snapshot || !presentation?.visibleCount || exporting) return
    const captured = snapshot
    setExporting(true)
    try { await downloadDietaryCard(captured, language); setNotice('图片已生成') }
    catch { setNotice('图片保存失败，请重试') }
    finally { setExporting(false) }
  }

  return <main className="app-shell dietary-card-page">
    <DietaryHeader memberName={member.name} onBack={() => navigate('/nurse-station')} />
    <div className="dietary-card-scroll">
      <nav aria-label="忌口出示卡操作" className="dietary-toolbar">
        <button disabled={state.status !== 'ready'} onClick={() => navigate('/dietary-card/edit')} type="button"><Pencil />修改</button>
        <label aria-label="选择出示语言"><select onChange={(event) => setLanguage(event.target.value as DietaryCardLanguage)} value={language}><option value="zh">中文</option><option value="en-zh">English + 中文</option></select><ChevronDown aria-hidden="true" /></label>
        <button disabled={state.status !== 'ready' || refreshing} onClick={() => void update()} type="button"><RefreshCw className={refreshing ? 'is-spinning' : ''} />{refreshing ? '更新中' : '更新'}</button>
        <button disabled={!presentation?.visibleCount || exporting} onClick={() => void saveImage()} type="button"><Download />{exporting ? '生成中' : '保存图片'}</button>
      </nav>
      {state.status === 'loading' ? <section aria-label="正在读取忌口清单" className="dietary-loading"><span /><span /><span /></section>
        : state.status === 'error' ? <StatusNotice action={<HohoButton onClick={() => void reload(false)} variant="secondary">重试</HohoButton>} tone="error" title={state.error || '读取失败，请重试'} />
          : snapshot && presentation ? <>
            {state.error && <p className="dietary-inline-error" role="status">最新来源读取失败，当前已保存卡片仍可使用。</p>}
            {presentation.visibleCount > 12 && <p className="dietary-overflow-hint">共{presentation.visibleCount}项，请下滑查看全部</p>}
            {presentation.missingTranslations.length > 0 && <p className="dietary-translation-notice">{presentation.missingTranslations.join('、')}缺少英文名称，已保留中文。</p>}
            {presentation.visibleCount ? <DietaryCardPanel language={language} snapshot={snapshot} /> : <DietaryEmptyState selectionEmpty={selectionEmpty} />}
          </> : null}
    </div>
    {notice && <p aria-live="polite" className="dietary-toast" role="status">{notice}</p>}
  </main>
}

interface FoodEditorState { id?: string; name: string; group: DietaryCardGroup }

export function DietaryCardEditPage() {
  const navigate = useNavigate()
  const member = useCurrentMember()
  const { currentMemberId, state } = useDietaryCardData()
  const [draft, setDraft] = useState<DietaryCardSnapshot | null>(null)
  const [editor, setEditor] = useState<FoodEditorState | null>(null)
  const [editorError, setEditorError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (state.status === 'ready' && state.snapshot && state.snapshot.memberId === currentMemberId && (!draft || draft.memberId !== currentMemberId)) {
      setDraft(structuredClone(state.snapshot))
    }
  }, [currentMemberId, draft, state])

  const openEditor = (item?: DietaryCardItem) => {
    setEditor(item ? { id: item.id, name: item.name, group: item.group } : { name: '', group: 'temporary' })
    setEditorError('')
  }

  const submitEditor = (event: FormEvent) => {
    event.preventDefault()
    if (!draft || !editor) return
    const name = normalizeFoodName(editor.name)
    if (!name) { setEditorError('请输入食物名称'); return }
    if (dietaryItemExists(draft.items, name, editor.id)) { setEditorError('已在清单中'); return }
    if (editor.id) {
      setDraft({ ...draft, items: draft.items.map((item) => item.id === editor.id ? {
        ...item, name, foodId: foodIdFor(name), group: editor.group, visible: true,
        nameAdjusted: item.sourceName ? name !== item.sourceName : true,
        groupAdjusted: item.sourceGroup ? editor.group !== item.sourceGroup : true,
        needsReview: false
      } : item) })
    } else setDraft({ ...draft, items: [...draft.items, createManualDietaryItem(name, editor.group)] })
    setEditor(null)
  }

  const save = async () => {
    if (!draft || saving) return
    const requestMemberId = currentMemberId
    const next = { ...draft, memberId: requestMemberId, savedAt: new Date().toISOString() }
    setSaving(true)
    setSaveError('')
    try {
      await saveProfileSection(sectionKey(requestMemberId), [next])
      if (useAppStore.getState().currentMemberId !== requestMemberId) throw new Error('当前家人已切换，请重新确认')
      navigate('/dietary-card', { replace: true, state: { notice: '已保存并更新' } })
    } catch { setSaveError('保存失败，请重试') }
    finally { setSaving(false) }
  }

  if (state.status === 'error') return <main className="app-shell dietary-card-page"><DietaryHeader editing memberName={member.name} onBack={() => navigate('/dietary-card', { replace: true })} /><StatusNotice tone="error" title={state.error} /></main>
  if (state.status === 'loading' || !draft) return <main className="app-shell dietary-card-page"><DietaryHeader editing memberName={member.name} onBack={() => navigate('/dietary-card', { replace: true })} /><section className="dietary-loading" aria-label="正在读取忌口清单"><span /><span /><span /></section></main>

  const groups = ([['avoid', '明确不能吃'], ['temporary', '暂时请避开']] as const)
  return <main className="app-shell dietary-card-page dietary-edit-page">
    <DietaryHeader editing memberName={member.name} onBack={() => navigate('/dietary-card', { replace: true })} />
    <div className="dietary-edit-scroll">
      {groups.map(([group, label]) => <section className="dietary-edit-group" data-group={group} key={group}><header><span aria-hidden="true" /><h2>{label}</h2>{group === 'temporary' && <small>尚待确认，本次也请避开</small>}</header><div>{draft.items.filter((item) => item.group === group).map((item) => <article className="dietary-edit-item" data-visible={item.visible} key={item.id}><button aria-label={`${item.visible ? '取消选择' : '选择'}${item.name}`} aria-pressed={item.visible} className="dietary-item-check" onClick={() => setDraft({ ...draft, items: draft.items.map((entry) => entry.id === item.id ? { ...entry, visible: !entry.visible } : entry) })} type="button">{item.visible && <Check />}</button><FoodGlyph group={group} name={item.name} /><div><strong>{item.name}</strong>{item.needsReview && <small>来源有变化，请核对</small>}</div><button aria-label={`修改${item.name}`} className="dietary-item-edit" onClick={() => openEditor(item)} type="button"><Pencil /></button><button aria-label={`从出示清单移除${item.name}`} className="dietary-item-remove" onClick={() => setDraft({ ...draft, items: item.manuallyAdded ? draft.items.filter((entry) => entry.id !== item.id) : draft.items.map((entry) => entry.id === item.id ? { ...entry, visible: false } : entry) })} type="button"><Trash2 /></button></article>)}</div></section>)}
      {!draft.items.length && <p className="dietary-edit-empty">还没有食物，添加后可选择本次出示分组。</p>}
      <button className="dietary-add-food" onClick={() => openEditor()} type="button"><Plus />添加食物</button>
      <label className="dietary-cross-contact-toggle"><input checked={draft.avoidCrossContact} onChange={(event) => setDraft({ ...draft, avoidCrossContact: event.target.checked })} type="checkbox" /><span aria-hidden="true" /><strong>提醒避免共用锅具、餐具接触</strong></label>
      <p className="dietary-edit-note">仅调整出示清单，不修改健康档案中的原始记录。</p>
      {saveError && <p className="dietary-save-error" role="alert">{saveError}</p>}
    </div>
    <footer className="dietary-edit-footer"><HohoButton disabled={saving} fullWidth loading={saving} onClick={() => void save()} size="large">保存并更新</HohoButton></footer>
    <BottomSheetSurface footer={<HohoButton disabled={!editor?.name.trim()} form="dietary-food-editor" fullWidth size="large" type="submit">{editor?.id ? '保存修改' : '添加到清单'}</HohoButton>} label={editor?.id ? '修改食物' : '添加食物'} onClose={() => setEditor(null)} open={Boolean(editor)} title={editor?.id ? '修改食物' : '添加食物'}>
      {editor && <form className="dietary-food-editor" id="dietary-food-editor" onSubmit={submitEditor}><HohoInput autoFocus error={editorError} label="食物名称" maxLength={30} onChange={(event) => { setEditor({ ...editor, name: event.target.value }); setEditorError('') }} placeholder="例如：牛奶" value={editor.name} /><label><span className="hoho-text-label">所属分组</span><select aria-label="所属分组" onChange={(event) => setEditor({ ...editor, group: event.target.value as DietaryCardGroup })} value={editor.group}><option value="temporary">暂时请避开（安全默认）</option><option value="avoid">明确不能吃</option></select></label></form>}
    </BottomSheetSurface>
  </main>
}
