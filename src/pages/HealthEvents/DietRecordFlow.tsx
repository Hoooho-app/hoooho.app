import { ArrowLeft, Mic, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HohoButton, HohoInput, HohoToggle } from '../../components/design-system'
import { getSpeechRecognitionConstructor, speechErrorMessage, type SpeechRecognitionLike } from '../../features/feedback/speechInput'
import { getBrowserVoiceCapability } from '../../features/quick-record/browserVoiceCapability'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import type { JournalDietDetails, JournalMetadata, DietRecordKind } from '../../types/journal'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'

type InputChannel = 'voice' | 'text'
type SaveRecord = (content: string, occurredAt: string, channel: InputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>

const kindTitles: Record<DietRecordKind, string> = {
  feeding: '记录喂养', complementary: '记录辅食', meal: '记录正餐', snack: '记录零食'
}

const feedingMethods = [
  ['breast', '母乳'], ['formula', '配方奶'], ['expressed', '瓶喂母乳'], ['mixed', '混合喂养']
] as const
const feedingStatusOptions = ['顺利', '吐奶', '呛咳', '拒绝']
const reactionOptions = ['暂未发现', '皮肤', '呼吸', '消化', '其他']
const formOptions = [['puree', '泥糊'], ['minced', '碎末'], ['small-pieces', '小颗粒'], ['finger-food', '手指食物']] as const
const complementaryAmounts = ['尝了几口', '约 1/4 碗', '约 1/2 碗', '大部分', '全部吃完']
const mealAmounts = ['没吃', '少量', '一半', '大部分', '吃完']
const appetiteOptions = ['比平时少', '和平时差不多', '比平时多'] as const
const commonComplementary = ['鸡蛋黄', '南瓜泥', '大米粥']
const commonMeals = ['番茄牛肉', '米饭', '西兰花']

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

function FoodEditor({ foods, onFoodsChange, common, voice }: { foods: string[]; onFoodsChange: (foods: string[]) => void; common: readonly string[]; voice?: ReturnType<typeof useDietVoice> }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const value = raw.trim()
    if (!value || foods.includes(value)) return
    onFoodsChange([...foods, value])
    setDraft('')
  }
  useEffect(() => {
    if (voice?.transcript) setDraft(voice.transcript)
  }, [voice?.transcript])
  return <section className="diet-form-section" aria-labelledby="diet-foods-heading">
    <h2 id="diet-foods-heading">吃了什么</h2>
    <div className="diet-food-input"><input aria-label="输入食物名称" maxLength={80} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(draft) } }} placeholder="输入食物或菜品" value={draft} /><HohoButton aria-label="添加食物" disabled={!draft.trim()} size="icon" variant="secondary" onClick={() => add(draft)}><Plus size={19} /></HohoButton></div>
    {foods.length > 0 && <div className="diet-food-chips" aria-label="已添加食物">{foods.map((food) => <button aria-label={`删除${food}`} key={food} onClick={() => onFoodsChange(foods.filter((item) => item !== food))} type="button">{food}<span aria-hidden="true">×</span></button>)}</div>}
    <div className="diet-common-foods"><span>常吃</span>{common.map((food) => <button disabled={foods.includes(food)} key={food} onClick={() => add(food)} type="button">{food}</button>)}</div>
    {voice && <><HohoButton className="diet-voice-button" disabled={voice.state === 'requesting' || voice.state === 'processing'} variant="secondary" onClick={voice.state === 'listening' ? voice.stop : voice.start}><Mic size={18} />{voice.label}</HohoButton>{voice.message && <p aria-live="polite" className="diet-inline-message">{voice.message}</p>}</>}
  </section>
}

function useDietVoice() {
  type VoiceState = 'idle' | 'requesting' | 'listening' | 'processing'
  const [state, setState] = useState<VoiceState>('idle')
  const [message, setMessage] = useState('')
  const [transcript, setTranscript] = useState('')
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const stateRef = useRef<VoiceState>('idle')
  const transcriptRef = useRef('')
  const timer = useRef<number | null>(null)
  const updateState = (value: VoiceState) => { stateRef.current = value; setState(value) }
  const cleanup = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null }
  const reset = () => { cleanup(); recognition.current = null; updateState('idle') }
  const stop = () => { if (stateRef.current !== 'listening') return; updateState('processing'); recognition.current?.stop() }
  const start = async () => {
    if (stateRef.current !== 'idle') return
    const capability = getBrowserVoiceCapability()
    const Constructor = getSpeechRecognitionConstructor()
    if (!capability.canAttemptMicrophone || !Constructor) { setMessage('当前浏览器不支持语音记录'); return }
    setMessage(''); setTranscript(''); transcriptRef.current = ''; updateState('requesting')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      cleanup()
      if ((stateRef.current as VoiceState) !== 'requesting') return
      const instance = new Constructor()
      recognition.current = instance
      instance.lang = 'zh-CN'; instance.continuous = true; instance.interimResults = true
      instance.onresult = (event) => { let value = ''; for (let index = 0; index < event.results.length; index += 1) value += event.results[index][0].transcript; transcriptRef.current = value.trim() }
      instance.onerror = (event) => { setMessage(speechErrorMessage(event.error)); instance.abort(); reset() }
      instance.onend = () => { const value = transcriptRef.current.trim(); if (stateRef.current === 'processing' && value) setTranscript(value); else if (!value) setMessage('没有听清，请再试一次'); reset() }
      instance.start(); updateState('listening'); timer.current = window.setTimeout(stop, 120_000)
    } catch { setMessage('无法使用麦克风，请检查浏览器权限'); reset() }
  }
  useEffect(() => () => { cleanup(); recognition.current?.abort() }, [])
  const label = state === 'listening' ? '正在聆听 · 点击结束' : state === 'processing' ? '正在转成文字…' : state === 'requesting' ? '正在请求麦克风…' : '语音记录'
  return { state, message, transcript, label, start: () => { void start() }, stop }
}

function FeedingForm({ occurredAt, setOccurredAt, onSave, saving }: CommonFormProps) {
  const [method, setMethod] = useState<JournalDietDetails['feedingMethod']>('breast')
  const [seconds, setSeconds] = useState({ left: 0, right: 0 })
  const [activeSide, setActiveSide] = useState<'left' | 'right' | null>(null)
  const [bottleMl, setBottleMl] = useState('')
  const [statuses, setStatuses] = useState<string[]>([])
  const hasBreast = method === 'breast' || method === 'mixed'
  const hasBottle = method === 'formula' || method === 'expressed' || method === 'mixed'
  useEffect(() => {
    if (!activeSide) return
    const id = window.setInterval(() => setSeconds((value) => ({ ...value, [activeSide]: value[activeSide] + 1 })), 1000)
    return () => window.clearInterval(id)
  }, [activeSide])
  useEffect(() => { if (!hasBreast) setActiveSide(null) }, [hasBreast])
  const total = seconds.left + seconds.right
  const valid = (hasBreast && total > 0) || (hasBottle && Number(bottleMl) > 0)
  const save = () => {
    const label = feedingMethods.find(([value]) => value === method)?.[1] ?? '喂养'
    const parts = [label]
    if (hasBreast) parts.push(total ? `${Math.max(1, Math.round(total / 60))}分钟` : '母乳时长未记录')
    if (hasBottle) parts.push(`${Number(bottleMl)}毫升`)
    if (statuses.length) parts.push(statuses.join('、'))
    onSave(parts.join(' · '), { kind: 'feeding', feedingMethod: method, ...(hasBreast ? { breastSeconds: { ...seconds, total } } : {}), ...(hasBottle ? { bottleMl: Number(bottleMl) } : {}), feedingStatuses: statuses })
  }
  return <>
    <ChoiceGroup label="喂养方式" options={feedingMethods.map(([, label]) => label)} value={feedingMethods.find(([value]) => value === method)?.[1] ?? ''} onChange={(label) => setMethod(feedingMethods.find(([, item]) => item === label)?.[0] ?? 'breast')} />
    {hasBreast && <section className="diet-form-section"><h2>母乳喂养时长</h2><div className="diet-timer-grid">{(['left', 'right'] as const).map((side) => <button aria-pressed={activeSide === side} key={side} onClick={() => setActiveSide(activeSide === side ? null : side)} type="button"><span>{side === 'left' ? '左侧' : '右侧'}</span><strong>{formatDuration(seconds[side])}</strong><em>{activeSide === side ? '停止计时' : '开始计时'}</em></button>)}</div><div className="diet-total-duration"><span>本次喂养总时长</span><strong>{formatDuration(total)}</strong></div></section>}
    {hasBottle && <HohoInput inputMode="decimal" label="喂奶量" min="1" onChange={(event) => setBottleMl(event.target.value)} placeholder="例如 120" type="number" value={bottleMl} hint="单位：毫升" />}
    <MultiChoiceGroup label="进食状态（可选）" options={feedingStatusOptions} values={statuses} onChange={setStatuses} />
    <RecordTime occurredAt={occurredAt} setOccurredAt={setOccurredAt} />
    <SaveBar disabled={!valid} onClick={save} saving={saving} />
  </>
}

interface CommonFormProps { occurredAt: string; setOccurredAt: (value: string) => void; onSave: (content: string, details: JournalDietDetails, channel?: InputChannel) => void; saving: boolean }

function FoodRecordForm({ kind, occurredAt, setOccurredAt, onSave, saving, photoModel }: CommonFormProps & { kind: 'complementary' | 'meal' | 'snack'; photoModel: ReturnType<typeof useQuickRecordPhotos> }) {
  const voice = useDietVoice()
  const [foods, setFoods] = useState<string[]>([])
  const [foodForm, setFoodForm] = useState<JournalDietDetails['foodForm']>()
  const [amount, setAmount] = useState('')
  const [firstTry, setFirstTry] = useState(false)
  const [firstTryFoods, setFirstTryFoods] = useState<string[]>([])
  const [meal, setMeal] = useState<'早餐' | '午餐' | '晚餐'>(() => { const hour = new Date().getHours(); return hour < 10 ? '早餐' : hour < 16 ? '午餐' : '晚餐' })
  const [appetite, setAppetite] = useState<JournalDietDetails['appetite']>()
  const [reactionsOpen, setReactionsOpen] = useState(kind === 'complementary')
  const [reactions, setReactions] = useState<string[]>([])
  useEffect(() => setFirstTryFoods((values) => values.filter((food) => foods.includes(food))), [foods])
  const isComplementary = kind === 'complementary'
  const isMeal = kind === 'meal'
  const common = isComplementary ? commonComplementary : commonMeals
  const usableVoice = isComplementary ? undefined : voice
  const hasFood = foods.length > 0 || Boolean(usableVoice?.transcript)
  const valid = hasFood && Boolean(amount) && (!isComplementary || Boolean(foodForm)) && (!isMeal || Boolean(appetite)) && (!firstTry || firstTryFoods.length > 0)
  const updateReactions = (values: string[]) => {
    if (!reactions.includes('暂未发现') && values.includes('暂未发现')) setReactions(['暂未发现'])
    else if (reactions.includes('暂未发现') && values.some((value) => value !== '暂未发现')) setReactions(values.filter((value) => value !== '暂未发现'))
    else setReactions(values)
  }
  const save = () => {
    const title = isComplementary ? '辅食' : isMeal ? '正餐' : '零食'
    const listedFoods = foods.length ? foods.join('、') : voice.transcript
    const lines = [`${title}${isMeal ? ` · ${meal}` : ''}`, `${listedFoods} · ${amount}`]
    if (firstTry && firstTryFoods.length) lines.push(`首次尝试：${firstTryFoods.join('、')}`)
    if (isMeal && appetite) lines.push(`食欲：${appetite}`)
    if (reactions.length) lines.push(reactions.includes('暂未发现') ? '暂未发现异常' : `进食后观察：${reactions.join('、')}`)
    onSave(lines.join('\n'), {
      kind, foods, amount,
      ...(isComplementary ? { foodForm, firstTryFoods: firstTry ? firstTryFoods : [] } : {}),
      ...(isMeal ? { meal, appetite } : kind === 'snack' ? { meal: '零食' as const } : {}),
      reactions,
      ...(usableVoice?.transcript ? { voiceTranscript: usableVoice.transcript } : {})
    }, usableVoice?.transcript ? 'voice' : 'text')
  }
  return <>
    {isMeal && <ChoiceGroup label="餐次" options={['早餐', '午餐', '晚餐']} value={meal} onChange={(value) => setMeal(value as typeof meal)} />}
    <FoodEditor common={common} foods={foods} onFoodsChange={setFoods} voice={usableVoice} />
    <QuickRecordPhotos model={photoModel} />
    {isComplementary && <ChoiceGroup label="食物形态" options={formOptions.map(([, label]) => label)} value={formOptions.find(([value]) => value === foodForm)?.[1] ?? ''} onChange={(label) => setFoodForm(formOptions.find(([, item]) => item === label)?.[0])} />}
    <ChoiceGroup label="吃了多少" options={isComplementary ? complementaryAmounts : mealAmounts} value={amount} onChange={setAmount} />
    {isComplementary && <section className="diet-toggle-row"><div><strong>首次尝试这种食物</strong><span>选择本次第一次吃的具体食物</span></div><HohoToggle checked={firstTry} label="首次尝试这种食物" onChange={(checked) => { setFirstTry(checked); if (!checked) setFirstTryFoods([]) }} /></section>}
    {isComplementary && firstTry && <MultiChoiceGroup label="哪一种食物是首次尝试" options={foods} values={firstTryFoods} onChange={setFirstTryFoods} />}
    {isMeal && <ChoiceGroup label="食欲" options={appetiteOptions} value={appetite ?? ''} onChange={(value) => setAppetite(value as JournalDietDetails['appetite'])} />}
    <section className="diet-collapsible"><button aria-expanded={reactionsOpen} onClick={() => setReactionsOpen((value) => !value)} type="button"><span>进食后有无异常 <em>（可选）</em></span><span aria-hidden="true">{reactionsOpen ? '−' : '+'}</span></button>{reactionsOpen && <MultiChoiceGroup label="观察到的情况" options={reactionOptions} values={reactions} onChange={updateReactions} hint={isComplementary ? '可以稍后补充，不必等够观察时间' : undefined} />}</section>
    <RecordTime occurredAt={occurredAt} setOccurredAt={setOccurredAt} />
    <SaveBar disabled={!valid || photoModel.blocked} onClick={save} saving={saving} />
  </>
}

function RecordTime({ occurredAt, setOccurredAt }: { occurredAt: string; setOccurredAt: (value: string) => void }) {
  return <HohoInput label="记录时间" max={localDateTimeValue()} onChange={(event) => setOccurredAt(event.target.value)} type="datetime-local" value={occurredAt} hint="默认为现在" />
}

function SaveBar({ disabled, onClick, saving }: { disabled: boolean; onClick: () => void; saving: boolean }) {
  return <div className="diet-record-save"><HohoButton disabled={disabled} fullWidth loading={saving} onClick={onClick} size="large">保存记录</HohoButton></div>
}

export function DietRecordFlow({ kind, memberId, token, onBack, onClose, onConfirm, onSaved }: { kind: DietRecordKind; memberId: string; token: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [occurredAt, setOccurredAt] = useState(() => localDateTimeValue())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const layerRef = useRef<HTMLElement>(null)
  const photoModel = useQuickRecordPhotos(memberId, token)
  usePageScrollLock(true)
  useDialogFocus(true, layerRef)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && photoModel.previewIndex === null && !saving) onBack() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onBack, photoModel.previewIndex, saving])
  const save = async (content: string, details: JournalDietDetails, channel: InputChannel = 'text') => {
    const occurredTimestamp = Date.parse(occurredAt)
    if (!occurredAt || !Number.isFinite(occurredTimestamp) || occurredTimestamp > Date.now()) { setError('记录时间不能晚于现在'); return }
    const isoTime = new Date(occurredTimestamp).toISOString()
    setSaving(true); setError('')
    try {
      const message = await onConfirm(content, isoTime, channel, photoModel.payload(), { categories: ['diet'], diet: details })
      photoModel.clearAfterSave()
      onSaved(message)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试')
    } finally { setSaving(false) }
  }
  const common = { occurredAt, setOccurredAt, onSave: save, saving }
  return <div className="diet-record-page-layer"><section aria-label={kindTitles[kind]} aria-modal="true" className="diet-record-page" ref={layerRef} role="dialog" tabIndex={-1}>
    <header><button aria-label="返回喂养/饮食类型选择" disabled={saving} onClick={onBack} type="button"><ArrowLeft size={22} /></button><h1>{kindTitles[kind]}</h1><span aria-hidden="true" /></header>
    <div className="diet-record-scroll">{kind === 'feeding' ? <FeedingForm {...common} /> : <FoodRecordForm {...common} kind={kind} photoModel={photoModel} />}{error && <p aria-live="polite" className="diet-save-error" role="alert">{error}</p>}</div>
  </section></div>
}
