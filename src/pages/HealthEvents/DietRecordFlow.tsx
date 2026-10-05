import { ArrowLeft, Pencil, Plus, Milk, Soup } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HohoButton, HohoInput, HohoSegmentedControl } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { dietDraftScope, useDietDraftState } from './dietDraftState'
import './DietCategorySwitch.css'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import type { JournalDietDetails, JournalMetadata, DietRecordKind } from '../../types/journal'
import { familyMemberService } from '../../services/familyMembers'
import { useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { OccurrenceTimeField, useOccurrenceTime } from './OccurrenceTimeField'

type InputChannel = 'voice' | 'text'
type SaveRecord = (content: string, occurredAt: string, channel: InputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>

const kindTitles: Record<DietRecordKind, string> = {
  feeding: '记录喂养', complementary: '记录辅食', meal: '记录正餐', snack: '记录零食', supplement: '记录补剂'
}

const feedingMethods = [
  ['breast', '母乳'], ['formula', '配方奶'], ['expressed', '瓶喂母乳'], ['mixed', '混合喂养']
] as const
const feedingStatusOptions = ['顺利', '吐奶', '呛咳', '抗拒']
const reactionOptions = ['皮肤', '呼吸', '消化']
const commonComplementary = ['鸡蛋黄', '南瓜泥', '大米粥']
const commonMeals = ['番茄牛肉', '米饭', '西兰花']
const commonSupplements = ['维生素D', '铁剂', '钙剂', 'DHA']
const defaultFrequentFoods = { complementary: commonComplementary, meal: commonMeals, snack: commonMeals }
const supplementUnits = ['滴', '毫升', '粒', '袋'] as const

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes ? `${minutes}分${String(remainder).padStart(2, '0')}秒` : `${remainder}秒`
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function ChoiceGroup({ label, options, value, onChange, optional = false }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void; optional?: boolean }) {
  return <fieldset className="diet-fieldset"><legend>{label}{optional && <span>（可选）</span>}</legend><div className="diet-choice-row">{options.map((option) => <button aria-pressed={value === option} key={option} onClick={() => onChange(value === option && optional ? '' : option)} type="button">{option}</button>)}</div></fieldset>
}

function MultiChoiceGroup({ label, options, values, onChange, hint }: { label: string; options: readonly string[]; values: string[]; onChange: (values: string[]) => void; hint?: string }) {
  return <fieldset className="diet-fieldset"><legend>{label}</legend>{hint && <p className="diet-field-hint">{hint}</p>}<div className="diet-choice-row">{options.map((option) => <button aria-pressed={values.includes(option)} key={option} onClick={() => onChange(toggleValue(values, option))} type="button">{option}</button>)}</div></fieldset>
}

function ReactionChoices({ values, onChange, hint }: { values: string[]; onChange: (values: string[]) => void; hint?: string }) {
  return <div aria-label="进食后有无异常" className="diet-reaction-fieldset" role="group">
    {hint && <p className="diet-field-hint">{hint}</p>}
    <div className="diet-reaction-grid">{reactionOptions.map((option) => <button aria-pressed={values.includes(option)} key={option} onClick={() => onChange(toggleValue(values, option))} type="button">{option}</button>)}</div>
  </div>
}

function FoodEditor({ foods, onFoodsChange, common, onCommonChange, draftKey, inlineActions = false, heading = '吃了什么', placeholder = '输入食物或菜品', inputLabel = '输入食物名称', addLabel = '添加食物', commonLabel = '常吃', itemsLabel = '已添加食物' }: { foods: string[]; onFoodsChange: (foods: string[]) => void; common: readonly string[]; onCommonChange?: (foods: string[]) => Promise<void>; draftKey?: string; inlineActions?: boolean; heading?: string; placeholder?: string; inputLabel?: string; addLabel?: string; commonLabel?: string; itemsLabel?: string }) {
  const [draft, setDraft] = useDietDraftState(draftKey, '')
  const [editingCommon, setEditingCommon] = useState(false)
  const [commonDraft, setCommonDraft] = useState('')
  const [editableCommon, setEditableCommon] = useState<string[]>([...common])
  const [savingCommon, setSavingCommon] = useState(false)
  const [commonError, setCommonError] = useState('')
  const add = (raw: string) => {
    const value = raw.trim()
    if (!value || foods.includes(value)) return
    onFoodsChange([...foods, value])
    setDraft('')
  }
  useEffect(() => { if (!editingCommon) setEditableCommon([...common]) }, [common, editingCommon])
  const addCommon = () => {
    const value = commonDraft.trim()
    if (!value || editableCommon.includes(value) || editableCommon.length >= 12) return
    setEditableCommon((current) => [...current, value]); setCommonDraft('')
  }
  const finishCommon = async () => {
    if (!onCommonChange) return
    setSavingCommon(true); setCommonError('')
    try { await onCommonChange(editableCommon); setEditingCommon(false) }
    catch (reason) { setCommonError(reason instanceof Error ? reason.message : '常吃食物保存失败') }
    finally { setSavingCommon(false) }
  }
  const editCommonButton = onCommonChange && <button aria-expanded={editingCommon} className={inlineActions ? 'diet-common-edit' : undefined} disabled={savingCommon} onClick={() => editingCommon ? void finishCommon() : setEditingCommon(true)} type="button"><Pencil size={14} />{editingCommon ? savingCommon ? '保存中' : '完成' : '编辑'}</button>
  return <section className={`diet-form-section${inlineActions ? ' diet-food-editor--inline-actions' : ''}`} aria-labelledby="diet-foods-heading">
    <h2 id="diet-foods-heading">{heading}</h2>
    <div className={`diet-food-input${inlineActions ? ' diet-food-input--inline' : ''}`}><input aria-label={inputLabel} maxLength={80} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(draft) } }} placeholder={placeholder} value={draft} />{(!inlineActions || draft.trim()) && <HohoButton aria-label={addLabel} disabled={!draft.trim()} size="icon" variant="secondary" onClick={() => add(draft)}><Plus size={19} /></HohoButton>}</div>
    {foods.length > 0 && <div className="diet-food-chips" aria-label={itemsLabel}>{foods.map((food) => <button aria-label={`删除${food}`} key={food} onClick={() => onFoodsChange(foods.filter((item) => item !== food))} type="button">{food}<span aria-hidden="true">×</span></button>)}</div>}
    <div className="diet-common-header"><span>{commonLabel}</span>{!inlineActions && editCommonButton}</div>
    <div className="diet-common-foods">{(editingCommon ? editableCommon : common).map((food) => <button aria-label={editingCommon ? `删除常吃食物${food}` : undefined} disabled={!editingCommon && foods.includes(food)} key={food} onClick={() => editingCommon ? setEditableCommon((current) => current.filter((item) => item !== food)) : add(food)} type="button">{food}{editingCommon && <span aria-hidden="true">×</span>}</button>)}{inlineActions && editCommonButton}</div>
    {editingCommon && <div className="diet-common-editor"><input aria-label="添加常吃食物" maxLength={30} onChange={(event) => setCommonDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCommon() } }} placeholder="添加常吃食物" value={commonDraft} /><button aria-label="确认添加常吃食物" disabled={!commonDraft.trim() || editableCommon.length >= 12} onClick={addCommon} type="button"><Plus size={17} /></button></div>}
    {commonError && <p aria-live="polite" className="diet-inline-message">{commonError}</p>}
  </section>
}

function FeedingForm({ method, active, scope, initialDiet, occurrence, onSave, saving, name, canStart }: CommonFormProps & { method: NonNullable<JournalDietDetails['feedingMethod']>; active: boolean; scope: string; initialDiet?: JournalDietDetails; name: string }) {
  const original = initialDiet?.feedingMethod === method ? initialDiet : undefined
  const [draft,setDraft] = useDietDraftState(`${scope}:feeding:${method}`, { seconds:{left:original?.breastSeconds?.left??0,right:original?.breastSeconds?.right??0},manualMinutes:{left:original?.breastSeconds?.left?String(original.breastSeconds.left/60):'',right:original?.breastSeconds?.right?String(original.breastSeconds.right/60):''},bottleMl:original?.bottleMl?String(original.bottleMl):'',statuses:original?.feedingStatuses??[] as string[] })
  const {seconds,manualMinutes,bottleMl,statuses} = draft
  const setSeconds = (change: (value: typeof seconds) => typeof seconds) => setDraft(value=>({...value,seconds:change(value.seconds)}))
  const setManualMinutes = (change: (value: typeof manualMinutes) => typeof manualMinutes) => setDraft(value=>({...value,manualMinutes:change(value.manualMinutes)}))
  const setBottleMl = (value:string) => setDraft(current=>({...current,bottleMl:value}))
  const setStatuses = (value:string[]) => setDraft(current=>({...current,statuses:value}))
  const [activeSide, setActiveSide] = useState<'left' | 'right' | null>(null)
  const hasBreast = method === 'breast' || method === 'mixed'
  const hasBottle = method === 'formula' || method === 'expressed' || method === 'mixed'
  useEffect(() => {
    if (!activeSide || !active) return
    const id = window.setInterval(() => setSeconds((value) => ({ ...value, [activeSide]: value[activeSide] + 1 })), 1000)
    return () => window.clearInterval(id)
  }, [activeSide,active])
  useEffect(() => { if (!active) setActiveSide(null) },[active])
  useEffect(() => { if (!hasBreast) setActiveSide(null) }, [hasBreast])
  const total = seconds.left + seconds.right
  const valid = Boolean(name.trim()) || (hasBreast && total > 0) || (hasBottle && Number(bottleMl) > 0)
  const save = (ongoing = false) => {
    const label = feedingMethods.find(([value]) => value === method)?.[1] ?? '喂养'
    const parts = [label]
    if (hasBreast && total) parts.push(`${Math.max(1, Math.round(total / 60))}分钟`)
    if (hasBottle && Number(bottleMl) > 0) parts.push(`${Number(bottleMl)}毫升`)
    if (statuses.length) parts.push(statuses.join('、'))
    onSave(parts.join(' · '), { kind: 'feeding', feedingMethod: method, ...(hasBreast && total > 0 ? { breastSeconds: { ...seconds, total } } : {}), ...(hasBottle && Number(bottleMl) > 0 ? { bottleMl: Number(bottleMl) } : {}), feedingStatuses: statuses, ...(ongoing ? { status: 'ongoing' } : {}) })
  }
  const setSideMinutes = (side: 'left' | 'right', value: string) => {
    const minutes = Math.min(1440, Math.max(0, Number(value) || 0))
    if (activeSide === side) setActiveSide(null)
    setManualMinutes((current) => ({ ...current, [side]: value }))
    setSeconds((current) => ({ ...current, [side]: Math.round(minutes * 60) }))
  }
  return <>
    {hasBreast && <section className="diet-form-section record-form-group"><h2>母乳喂养时长</h2><div className="diet-timer-grid">{(['left', 'right'] as const).map((side) => { const label = side === 'left' ? '左侧' : '右侧'; return <div className="diet-timer-card" data-active={activeSide === side} key={side}><button aria-label={`${label}${activeSide === side ? '停止计时' : '开始计时'}`} aria-pressed={activeSide === side} onClick={() => setActiveSide(activeSide === side ? null : side)} type="button"><span>{label}</span><strong>{formatDuration(seconds[side])}</strong><em>{activeSide === side ? '停止计时' : '开始计时'}</em></button><label><span>手填</span><input aria-label={`${label}手填分钟`} inputMode="decimal" max="1440" min="0" onChange={(event) => setSideMinutes(side, event.target.value)} placeholder="0" step="0.5" type="number" value={manualMinutes[side]} /><em>分钟</em></label></div> })}</div><div className="diet-total-duration"><span>本次喂养总时长</span><strong>{formatDuration(total)}</strong></div></section>}
    {hasBottle && <section className="record-form-group"><HohoInput inputMode="decimal" label="喂奶量" min="1" onChange={(event) => setBottleMl(event.target.value)} placeholder="例如 120" type="number" value={bottleMl} hint="单位：毫升" /></section>}
    <section className="record-form-group"><MultiChoiceGroup label="进食状态（可选）" options={feedingStatusOptions} values={statuses} onChange={setStatuses} /></section>
    <section className="record-time-group"><RecordTime occurrence={occurrence} /></section>
    <SaveBar disabled={!valid} onClick={() => save()} saving={saving} />
    {canStart && <HohoButton fullWidth loading={saving} variant="secondary" onClick={() => save(true)}>开始喂养</HohoButton>}
  </>
}

interface CommonFormProps { occurredAt: string; occurrence: ReturnType<typeof useOccurrenceTime>; setOccurredAt: (value: string) => void; onSave: (content: string, details: JournalDietDetails, channel?: InputChannel) => void; saving: boolean; canStart?: boolean }

function SupplementForm({ occurrence, onSave, saving, initialDiet }: CommonFormProps & { initialDiet?: JournalDietDetails }) {
  const [names, setNames] = useState<string[]>(initialDiet?.supplementNames??[])
  const [amount, setAmount] = useState(initialDiet?.supplementAmount??'')
  const [unit, setUnit] = useState<JournalDietDetails['supplementUnit']>(initialDiet?.supplementUnit??'滴')
  const valid = names.length > 0 && Boolean(amount.trim()) && Number(amount) > 0
  const save = () => {
    const normalizedAmount = amount.trim()
    onSave(`补剂\n${names.join('、')} · ${normalizedAmount}${unit}`, {
      kind: 'supplement', supplementNames: names, supplementAmount: normalizedAmount, supplementUnit: unit
    })
  }
  return <>
    <div className="record-form-group"><FoodEditor addLabel="添加补剂" common={commonSupplements} commonLabel="常用" inlineActions foods={names} heading="补充了什么" inputLabel="输入补剂名称" itemsLabel="已添加补剂" onFoodsChange={setNames} placeholder="输入补剂名称" /></div>
    <section className="record-form-group record-dose-group supplement-record-dose-group"><HohoInput inputMode="decimal" label="用量" min="0.1" onChange={(event) => setAmount(event.target.value)} placeholder="例如 1" step="0.1" type="number" value={amount} /><ChoiceGroup label="单位" options={supplementUnits} value={unit ?? '滴'} onChange={(value) => setUnit(value as JournalDietDetails['supplementUnit'])} /></section>
    <section className="record-time-group supplement-record-time-group"><RecordTime occurrence={occurrence} /></section>
    <SaveBar disabled={!valid} onClick={save} saving={saving} />
  </>
}

function FoodRecordForm({ kind, scope, initialDiet, occurrence, onSave, saving, common, onCommonChange, canStart }: CommonFormProps & { kind: 'complementary' | 'meal' | 'snack'; scope: string; initialDiet?: JournalDietDetails; common: readonly string[]; onCommonChange?: (foods: string[]) => Promise<void> }) {
  const [draft,setDraft] = useDietDraftState(`${scope}:food`,{foods:initialDiet?.foods??[] as string[],reactions:initialDiet?.reactions??[] as string[]})
  const {foods,reactions} = draft
  const setFoods = (foods:string[]) => setDraft(current=>({...current,foods}))
  const setReactions = (reactions:string[]) => setDraft(current=>({...current,reactions}))
  const isComplementary = kind === 'complementary'
  const hasFood = foods.length > 0
  const isSnack = kind === 'snack'
  const valid = hasFood
  const save = (ongoing = false) => {
    const title = isComplementary ? '辅食' : isSnack ? '零食' : '正餐'
    const listedFoods = foods.join('、')
    const lines = [title, listedFoods]
    if (reactions.length) lines.push(reactions.includes('暂未发现') ? '暂未发现异常' : `进食后观察：${reactions.join('、')}`)
    onSave(lines.join('\n'), {
      kind, foods, ...(isSnack ? { meal: '零食' as const } : {}),
      reactions, ...(ongoing ? { status: 'ongoing' } : {})
    })
  }
  return <>
    <div className="record-form-group"><FoodEditor common={common} draftKey={`${scope}:food-input`} inlineActions foods={foods} onCommonChange={onCommonChange} onFoodsChange={setFoods} /></div>
    <div className="record-form-group"><section className="diet-reaction-section"><h2>进食后有无异常 <em>（可选）</em></h2><ReactionChoices hint="可以稍后补充，不必等待观察时间" values={reactions} onChange={setReactions} /></section></div>
    <section className="record-time-group"><RecordTime occurrence={occurrence} /></section>
    <SaveBar disabled={!valid} onClick={() => save()} saving={saving} />
    {canStart && kind === 'meal' && <HohoButton fullWidth loading={saving} variant="secondary" onClick={() => save(true)}>开始用餐</HohoButton>}
  </>
}

function RecordTime({ occurrence }: { occurrence: ReturnType<typeof useOccurrenceTime> }) {
  return <OccurrenceTimeField model={occurrence} label="记录时间" />
}

function SaveBar({ disabled, onClick, saving }: { disabled: boolean; onClick: () => void; saving: boolean }) {
  return <div className="diet-record-save"><HohoButton disabled={disabled} fullWidth loading={saving} onClick={onClick} size="large">保存记录</HohoButton></div>
}

export function DietRecordFlow({ kind: initialKind, initialDiet, initialOccurredAt, recordId, memberId, token, selectedDay, today, onBack, onClose, onConfirm, onSaved }: { kind: DietRecordKind; initialDiet?: JournalDietDetails; initialOccurredAt?: string; recordId?: string; memberId: string; token: string; selectedDay: string; today: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const accountId = useAppStore(state=>state.authUser?.id ?? '')
  const scope = `${dietDraftScope(accountId,memberId)}${recordId?`:edit:${recordId}`:initialKind==='supplement'?':supplement':''}`
  const [selectedKind,setKind] = useDietDraftState<DietRecordKind>(`${scope}:kind`,initialKind==='supplement'?'feeding':initialKind)
  const kind = initialKind==='supplement'?'supplement':selectedKind
  const [lastFoodKind,setLastFoodKind] = useDietDraftState<'complementary'|'meal'|'snack'>(`${scope}:food-kind`,'complementary')
  const [method,setMethod] = useDietDraftState<NonNullable<JournalDietDetails['feedingMethod']>>(`${scope}:method`,initialDiet?.feedingMethod??'breast')
  const [milkTime,setMilkTime] = useDietDraftState<string|undefined>(`${scope}:milk-time`,initialOccurredAt)
  const [foodTime,setFoodTime] = useDietDraftState<string|undefined>(`${scope}:food-time`,initialOccurredAt)
  const milkOccurrence = useOccurrenceTime(selectedDay,today,milkTime)
  const foodOccurrence = useOccurrenceTime(selectedDay,today,foodTime)
  const occurrence = kind === 'feeding' || kind === 'supplement' ? milkOccurrence : foodOccurrence
  const foodKind = kind === 'feeding' || kind === 'supplement' ? lastFoodKind : kind
  const occurredAt = occurrence.mode === 'now' ? localDateTimeValue(occurrence.now) : occurrence.specifiedValue
  const setOccurredAt = occurrence.setSpecifiedValue
  const [saving, setSaving] = useState(false)
  const submittingRef = useRef(false)
  const [error, setError] = useState('')
  const [recordName, setRecordName] = useDietDraftState(`${scope}:record-name`, initialDiet?.name ?? '')
  const [recordNote, setRecordNote] = useDietDraftState(`${scope}:record-note`, initialDiet?.note ?? '')
  const layerRef = useRef<HTMLElement>(null)
  const photoModel = useQuickRecordPhotos(memberId, token)
  const [frequentFoods, setFrequentFoods] = useState(defaultFrequentFoods)
  const [frequentFoodsReady, setFrequentFoodsReady] = useState(false)
  usePageScrollLock(true)
  useDialogFocus(true, layerRef)
  useEffect(() => {
    const controller = new AbortController()
    familyMemberService.getById(memberId, token, controller.signal).then((member) => {
      if (member.dietFrequentFoods) setFrequentFoods(member.dietFrequentFoods)
      setFrequentFoodsReady(true)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [memberId, token])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && photoModel.previewIndex === null && !saving) onBack() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onBack, photoModel.previewIndex, saving])
  const save = async (content: string, details: JournalDietDetails, channel: InputChannel = 'text') => {
    if (submittingRef.current) return
    const isoTime = occurrence.capture()
    if (!isoTime) return
    const preserved = initialDiet?.kind===details.kind && (details.kind!=='feeding'||initialDiet.feedingMethod===details.feedingMethod) ? initialDiet : undefined
    const normalizedDetails = { ...preserved, ...details, ...(recordName.trim() ? { name: recordName.trim() } : { name: undefined }), ...(recordNote.trim() ? { note: recordNote.trim() } : { note: undefined }), ...(details.status === 'ongoing' ? { startedAt: isoTime } : {}) }
    submittingRef.current = true; setSaving(true); setError('')
    try {
      const message = await onConfirm(content, isoTime, channel, photoModel.payload(), { categories: ['diet'], diet: normalizedDetails })
      photoModel.clearAfterSave()
      try {
        sessionStorage.removeItem(`${scope}:record-name`); sessionStorage.removeItem(`${scope}:record-note`)
        if (details.kind === 'feeding') { sessionStorage.removeItem(`${scope}:feeding:${details.feedingMethod}`); sessionStorage.removeItem(`${scope}:milk-time`) }
        else if (details.kind !== 'supplement') { for (const suffix of ['food','food-input','food-time']) sessionStorage.removeItem(`${scope}:${suffix}`) }
      } catch { /* Saving does not depend on draft storage availability. */ }
      onSaved(message)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试')
    } finally { submittingRef.current = false; setSaving(false) }
  }
  const common = { occurredAt, occurrence, setOccurredAt, onSave: save, saving, canStart: !recordId }
  const saveFrequentFoods = async (foodKind: 'complementary' | 'meal' | 'snack', foods: string[]) => {
    const next = { ...frequentFoods, [foodKind]: foods }
    const member = await familyMemberService.update(memberId, { dietFrequentFoods: next }, token)
    setFrequentFoods(member.dietFrequentFoods ?? next)
  }
  const selectKind = (next: DietRecordKind) => { setKind(next); if(next==='complementary'||next==='meal'||next==='snack') setLastFoodKind(next); setError('') }
  const title = initialKind === 'supplement' ? kindTitles.supplement : '喂养/饮食'
  useEffect(() => { setMilkTime(milkOccurrence.mode === 'specified' ? milkOccurrence.specifiedValue : undefined) },[milkOccurrence.mode,milkOccurrence.specifiedValue,setMilkTime])
  useEffect(() => { setFoodTime(foodOccurrence.mode === 'specified' ? foodOccurrence.specifiedValue : undefined) },[foodOccurrence.mode,foodOccurrence.specifiedValue,setFoodTime])
  return <div className="diet-record-page-layer"><section aria-label={title} aria-modal="true" className="diet-record-page diet-record-page--combined" ref={layerRef} role="dialog" tabIndex={-1}>
    <header><button aria-label="返回" disabled={saving} onClick={onBack} type="button"><ArrowLeft size={22} /></button><h1>{title}</h1><span aria-hidden="true" /></header>
    <div className="diet-record-scroll">
      {initialKind !== 'supplement' && <div className="diet-category-switches"><HohoSegmentedControl disabled={saving} label="喂养/饮食分类" value={kind==='feeding'?'milk':'food'} options={[{value:'milk',label:'奶类喂养',icon:<Milk aria-hidden="true" size={20}/>},{value:'food',label:'食物饮食',icon:<Soup aria-hidden="true" size={20}/>}]} onChange={value=>selectKind(value==='milk'?'feeding':foodKind)} />
        {kind==='feeding' ? <HohoSegmentedControl disabled={saving} label="喂养方式" value={method} options={feedingMethods.map(([value,label])=>({value,label}))} onChange={value=>{setMethod(value);setError('')}} /> : <HohoSegmentedControl disabled={saving} label="食物分类" value={foodKind} options={[{value:'complementary',label:'辅食'},{value:'meal',label:'正餐'},{value:'snack',label:'零食'}]} onChange={selectKind} />}</div>}
      {initialKind === 'supplement' ? <SupplementForm {...common} initialDiet={initialDiet}/> : <>
        {(kind === 'feeding' || kind === 'meal') && <section className="record-form-group"><HohoInput label="本次名称（选填）" maxLength={20} placeholder={kind === 'feeding' ? '例如：晚奶' : '例如：晚餐'} value={recordName} onChange={event => setRecordName(event.target.value)} /><HohoInput label="备注（选填）" maxLength={1000} value={recordNote} onChange={event => setRecordNote(event.target.value)} /></section>}
        {kind==='feeding' ? <div className="diet-family-panel"><FeedingForm {...common} name={recordName} active initialDiet={initialDiet} key={method} method={method} occurrence={milkOccurrence} scope={scope}/></div> : <div className="diet-family-panel"><FoodRecordForm {...common} common={frequentFoods[foodKind]} initialDiet={initialDiet} kind={foodKind} occurrence={foodOccurrence} scope={scope} onCommonChange={frequentFoodsReady ? (foods)=>saveFrequentFoods(foodKind,foods) : undefined}/></div>}
      </>}
      {error && <p aria-live="polite" className="diet-save-error" role="alert">{error}</p>}
    </div>
  </section></div>
}
