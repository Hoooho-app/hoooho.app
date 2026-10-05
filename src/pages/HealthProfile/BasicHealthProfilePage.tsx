import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronRight, List, Minus, Pencil, Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import { calculateGrowthPosition, exactAgeInMonths, heightMeasureLabel } from '../../features/health-profile/utils/childGrowthReference'
import { requiresMeasurementConfirmation } from '../../features/health-profile/utils/growthTrend'
import { resolveCurrentGrowthMeasurements, resolveCurrentGrowthSnapshot } from '../../features/health-profile/utils/resolveCurrentGrowthMeasurements'
import { familyMemberService } from '../../services/familyMembers'
import { growthMeasurementService } from '../../services/growthMeasurements'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { GrowthCurveChart } from './GrowthCurveChart'
import { validHeight } from './growthCardForm'
import { buildGrowthInterpretation, growthMetricLabel, metricDisplayValue, metricRecords, type GrowthMeasure } from './growthInterpretation'
import { formatSigned, formatWeightKg, stepHeightValue, stepWeightKgValue, validWeightKg } from './growthUpdateForm'

const localToday = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }
const draftKey = (memberId: string) => `hoooho:growth-data-draft:${memberId}`
const measureKey = (memberId: string) => `hoooho:growth-data-measure:${memberId}`
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Draft = { memberId: string; measure: GrowthMeasure; measuredAt: string; height: string; weightKg: string; heightTouched: boolean; weightTouched: boolean; scrollTop: number }
type RouteState = { selectedMeasure?: GrowthMeasure; returnTo?: unknown }

const ageText = (birthday: string | undefined, measuredAt: string) => {
  const months = exactAgeInMonths(birthday, measuredAt)
  if (months == null) return '月龄未知'
  const whole = Math.floor(months)
  return `${Math.floor(whole / 12)}岁${whole % 12}个月`
}

function readDraft(memberId: string): Draft | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(draftKey(memberId)) ?? 'null') as Draft | null
    return parsed?.memberId === memberId ? parsed : null
  } catch { return null }
}

export function BasicHealthProfilePage({ member }: { member: Member }) {
  const navigate = useNavigate(), location = useLocation(), token = useAppStore((state) => state.authToken), setMembers = useAppStore((state) => state.setMembers)
  const routeState = location.state as RouteState | null
  const returnTo = typeof routeState?.returnTo === 'string' && routeState.returnTo.startsWith('/') && routeState.returnTo !== '/health-profile/basic' ? routeState.returnTo : ''
  const restoredRef = useRef<Draft | null>(readDraft(member.id))
  const storedMeasure = sessionStorage.getItem(measureKey(member.id))
  const initialMeasure = routeState?.selectedMeasure ?? restoredRef.current?.measure ?? (storedMeasure === 'weight' ? 'weight' : 'height')
  const [measure, setMeasure] = useState<GrowthMeasure>(initialMeasure)
  const [records, setRecords] = useState<GrowthMeasurementApiDto[]>([]), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('')
  const [measuredAt, setMeasuredAt] = useState(restoredRef.current?.measuredAt ?? localToday()), [height, setHeight] = useState(restoredRef.current?.height ?? ''), [weightKg, setWeightKg] = useState(restoredRef.current?.weightKg ?? '')
  const [heightTouched, setHeightTouched] = useState(restoredRef.current?.heightTouched ?? false), [weightTouched, setWeightTouched] = useState(restoredRef.current?.weightTouched ?? false)
  const [editing, setEditing] = useState<'height' | 'weight' | null>(null), [saveState, setSaveState] = useState<SaveState>('idle'), [message, setMessage] = useState('')
  const initialHeightRef = useRef<number | null>(validHeight(height) ? Number(height) : null)
  const contentRef = useRef<HTMLDivElement>(null)

  const load = () => {
    if (!token) return
    const openedMemberId = member.id
    setLoading(true); setLoadError('')
    const controller = new AbortController()
    growthMeasurementService.list(openedMemberId, token, controller.signal).then((items) => {
      if (useAppStore.getState().currentMemberId !== openedMemberId) return
      setRecords(items)
      const restored = readDraft(openedMemberId)
      if (restored) {
        setMeasure(routeState?.selectedMeasure ?? restored.measure); setMeasuredAt(restored.measuredAt); setHeight(restored.height); setWeightKg(restored.weightKg); setHeightTouched(restored.heightTouched); setWeightTouched(restored.weightTouched)
        initialHeightRef.current = validHeight(restored.height) ? Number(restored.height) : null
        requestAnimationFrame(() => contentRef.current?.scrollTo({ top: restored.scrollTop ?? 0 }))
        return
      }
      const current = resolveCurrentGrowthMeasurements(member, items, openedMemberId)
      const nextHeight = current.heightCm == null ? '' : current.heightCm.toFixed(1), nextWeight = formatWeightKg(current.weightKg)
      setMeasuredAt(localToday()); setHeight(nextHeight); setWeightKg(nextWeight); setHeightTouched(false); setWeightTouched(false)
      initialHeightRef.current = validHeight(nextHeight) ? Number(nextHeight) : null
    }).catch((reason) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setLoadError(reason instanceof Error ? reason.message : '成长记录加载失败，请稍后重试')
    }).finally(() => { if (useAppStore.getState().currentMemberId === openedMemberId) setLoading(false) })
    return () => controller.abort()
  }

  useEffect(() => {
    restoredRef.current = readDraft(member.id)
    const persistedMeasure = sessionStorage.getItem(measureKey(member.id))
    setRecords([]); setMeasure(routeState?.selectedMeasure ?? restoredRef.current?.measure ?? (persistedMeasure === 'weight' ? 'weight' : 'height')); setSaveState('idle'); setMessage('')
    return load()
    // The route state is an entry hint; member identity owns all asynchronous data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id, token])

  const savedGrowth = useMemo(() => resolveCurrentGrowthSnapshot(member, records, member.id), [member, records])
  const measureItems = useMemo(() => metricRecords(records, measure), [measure, records]), latest = measureItems.at(-1)
  const latestValue = latest ? (measure === 'height' ? latest.heightCm : latest.weightKg) : null
  const latestPosition = latest && latestValue != null ? calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: latest.measuredAt, measure, value: latestValue }) : null
  const interpretation = useMemo(() => buildGrowthInterpretation({ member, measure, records, position: latestPosition }), [latestPosition, measure, member, records])
  const dateRecord = records.find((item) => item.measuredAt === measuredAt)
  const previousHeight = metricRecords(records.filter((item) => item.measuredAt < measuredAt), 'height').at(-1)
  const previousWeight = metricRecords(records.filter((item) => item.measuredAt < measuredAt), 'weight').at(-1)
  const heightValid = !height || validHeight(height), weightValid = !weightKg || validWeightKg(weightKg)
  const dirty = heightTouched || weightTouched
  const formValid = (!heightTouched || validHeight(height)) && (!weightTouched || validWeightKg(weightKg)) && dirty
  const heightDelta = heightTouched && validHeight(height) && previousHeight?.heightCm != null ? Number(height) - previousHeight.heightCm : null
  const weightDelta = weightTouched && validWeightKg(weightKg) && previousWeight?.weightKg != null ? Number(weightKg) - previousWeight.weightKg : null
  const heightAtFloor = initialHeightRef.current != null && Number(height) <= initialHeightRef.current

  const setDate = (nextDate: string) => {
    const existing = records.find((item) => item.measuredAt === nextDate)
    const priorRecords = records.filter((item) => item.measuredAt <= nextDate)
    const priorHeight = metricRecords(priorRecords, 'height').at(-1)?.heightCm
    const priorWeight = metricRecords(priorRecords, 'weight').at(-1)?.weightKg
    const nextHeight = existing?.heightCm == null ? priorHeight == null ? '' : priorHeight.toFixed(1) : existing.heightCm.toFixed(1)
    const nextWeight = formatWeightKg(existing?.weightKg ?? priorWeight)
    setMeasuredAt(nextDate); setHeight(nextHeight); setWeightKg(nextWeight); setHeightTouched(false); setWeightTouched(false); setSaveState('idle'); setMessage('')
    initialHeightRef.current = validHeight(nextHeight) ? Number(nextHeight) : null
  }

  const save = async () => {
    if (!token || !formValid || saveState === 'saving') return
    const openedMemberId = member.id
    setSaveState('saving'); setMessage('')
    try {
      const heightCm = heightTouched ? Number(height) : dateRecord?.heightCm ?? null
      const savedWeightKg = weightTouched ? Number(weightKg) : dateRecord?.weightKg ?? null
      const candidate = { measuredAt, heightCm, weightKg: savedWeightKg }
      const previous = [...records].filter((item) => item.measuredAt < measuredAt).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]
      const saved = await growthMeasurementService.upsert({ memberId: openedMemberId, ...candidate, measurementType: heightMeasureLabel(member.birthday, measuredAt) === '身长' ? 'length' : 'height', dataStatus: requiresMeasurementConfirmation(previous, candidate) ? 'pending_confirmation' : 'confirmed', standardId: 'who-2006' }, token)
      if (useAppStore.getState().currentMemberId !== openedMemberId) return
      const nextRecords = [saved, ...records.filter((item) => item.id !== saved.id)].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || b.createdAt.localeCompare(a.createdAt))
      setRecords(nextRecords)
      setHeightTouched(false); setWeightTouched(false); initialHeightRef.current = saved.heightCm; sessionStorage.removeItem(draftKey(openedMemberId))
      try {
        const current = resolveCurrentGrowthMeasurements(member, nextRecords, openedMemberId)
        const updated = await familyMemberService.update(openedMemberId, current, token)
        if (useAppStore.getState().currentMemberId !== openedMemberId) return
        const store = useAppStore.getState(); setMembers(store.members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item))
        setSaveState('saved'); setMessage('已保存，并加入成长记录')
      } catch { setSaveState('saved'); setMessage('成长记录已保存，基础资料将在刷新后同步') }
    } catch (error) { setSaveState('error'); setMessage(error instanceof Error ? error.message : '保存失败，已保留当前填写内容，请重试') }
  }

  const openRecords = () => {
    const draft: Draft = { memberId: member.id, measure, measuredAt, height, weightKg, heightTouched, weightTouched, scrollTop: contentRef.current?.scrollTop ?? 0 }
    sessionStorage.setItem(draftKey(member.id), JSON.stringify(draft))
    navigate('/health-profile/growth', { state: { selectedMeasure: measure, returnTo } })
  }

  const selectMeasure = (nextMeasure: GrowthMeasure) => { setMeasure(nextMeasure); sessionStorage.setItem(measureKey(member.id), nextMeasure) }

  const updateHeight = (value: string) => { setHeight(value); setHeightTouched(true); setSaveState('idle'); setMessage('') }
  const updateWeight = (value: string) => { setWeightKg(value); setWeightTouched(true); setSaveState('idle'); setMessage('') }
  const tabLabel = growthMetricLabel(measure, member.birthday, latest?.measuredAt)
  const recordsRange = measureItems.length ? `${measureItems[0].measuredAt.slice(5).replace('-', '/')}—${measureItems.at(-1)!.measuredAt.slice(5).replace('-', '/')}` : '暂无记录'

  return <main className="app-shell health-profile-detail-shell growth-data-page"><WebPageHeader fallback="/health-profile" onBack={returnTo ? () => navigate(returnTo, { replace: true }) : undefined} title="成长数据" /><div className="page-content growth-data-content" ref={contentRef}>
    <div className="growth-tabs growth-data-tabs" role="tablist" aria-label="成长指标"><button aria-selected={measure === 'height'} onClick={() => selectMeasure('height')} role="tab" type="button">身高曲线</button><button aria-selected={measure === 'weight'} onClick={() => selectMeasure('weight')} role="tab" type="button">体重曲线</button></div>
    {loading ? <p className="growth-loading">正在加载成长数据…</p> : loadError ? <button className="growth-retry" onClick={load} type="button">{loadError}，点击重试</button> : <>
      <section className="growth-data-curve" aria-label={`${tabLabel}最新记录与曲线`}>
        <header className="growth-data-latest"><span><small>最新记录</small>{latest && <em>{latest.measuredAt} · {ageText(member.birthday, latest.measuredAt)}</em>}</span>{latestValue == null ? <strong>暂无记录</strong> : <strong>{metricDisplayValue(measure, latestValue)} <i>{latestPosition?.percentileLabel ?? '暂无百分位'}</i></strong>}</header>
        <GrowthCurveChart measure={measure} member={member} records={records} />
      </section>
      <section className="growth-update-form growth-data-measurement" aria-busy={saveState === 'saving'}><header><h1>记录本次测量</h1><input aria-label="测量日期" max={localToday()} onChange={(event) => setDate(event.target.value)} type="date" value={measuredAt} /></header>
        <div className="growth-step-grid"><GrowthStepCard savedDate={savedGrowth.heightMeasuredAt} delta={heightDelta == null ? heightTouched ? '暂无上次记录' : '调整后显示变化' : `较上次 ${formatSigned(heightDelta)} cm`} error={!heightValid ? '请输入 20–260 cm' : ''} label={heightMeasureLabel(member.birthday, measuredAt)}>
          <button aria-label="身高减少0.1厘米" disabled={!validHeight(height) || heightAtFloor} onClick={() => updateHeight(stepHeightValue(height, -1, initialHeightRef.current))} type="button"><Minus /></button>{editing === 'height' ? <input aria-label="手动编辑身高 cm" autoFocus inputMode="decimal" max="260" min="20" onBlur={() => setEditing(null)} onChange={(event) => updateHeight(event.target.value)} step="0.1" type="number" value={height} /> : <button className="growth-step-value" onClick={() => setEditing('height')} type="button"><strong>{height || '—'}</strong><small>cm</small><Pencil aria-hidden="true" /></button>}<button aria-label="身高增加0.1厘米" disabled={!validHeight(height)} onClick={() => updateHeight(stepHeightValue(height, 1, initialHeightRef.current))} type="button"><Plus /></button>
        </GrowthStepCard><GrowthStepCard savedDate={savedGrowth.weightMeasuredAt} delta={weightDelta == null ? weightTouched ? '暂无上次记录' : '调整后显示变化' : `较上次 ${formatSigned(weightDelta)} kg`} error={!weightValid ? '请输入 1–500 kg，保留 1 位小数' : ''} label="体重">
          <button aria-label="体重减少0.1千克" disabled={!validWeightKg(weightKg) || Number(weightKg) <= 1} onClick={() => updateWeight(stepWeightKgValue(weightKg, -1))} type="button"><Minus /></button>{editing === 'weight' ? <input aria-label="手动编辑体重 kg" autoFocus inputMode="decimal" max="500" min="1" onBlur={() => setEditing(null)} onChange={(event) => updateWeight(event.target.value)} step="0.1" type="number" value={weightKg} /> : <button className="growth-step-value" onClick={() => setEditing('weight')} type="button"><strong>{weightKg || '—'}</strong><small>kg</small><Pencil aria-hidden="true" /></button>}<button aria-label="体重增加0.1千克" disabled={!validWeightKg(weightKg)} onClick={() => updateWeight(stepWeightKgValue(weightKg, 1))} type="button"><Plus /></button>
        </GrowthStepCard></div>
        <HohoButton className="growth-update-save" disabled={!formValid} fullWidth loading={saveState === 'saving'} onClick={() => void save()} size="large">保存本次更新</HohoButton>
        <p className={`growth-update-message growth-update-message--${saveState}`} aria-live="polite">{saveState === 'saved' && <Check aria-hidden="true" />}{message}</p>
      </section>
      <section className="growth-interpretation" aria-label={`${tabLabel}成长解读`}><header><h2>成长解读</h2><small>依据 {measureItems.length} 条记录 · {recordsRange}</small></header><dl><div><dt>这次记录</dt><dd>{interpretation.latest}</dd></div><div><dt>与上次相比</dt><dd>{interpretation.comparison}</dd></div><div><dt>这些记录能说明什么</dt><dd>{interpretation.observation}</dd></div><div><dt>接下来怎么做</dt><dd>{interpretation.next}</dd></div></dl><p>参考：WHO 儿童生长标准。百分位需结合准确月龄和测量方式理解。</p></section>
      <button className="growth-record-list-entry" onClick={openRecords} type="button"><i><List aria-hidden="true" /></i><span><strong>记录列表</strong><small>查看历史 · 编辑 · 删除</small></span><b>{records.length} 条</b><ChevronRight aria-hidden="true" /></button>
    </>}
  </div></main>
}

function GrowthStepCard({ children, delta, error, label, savedDate }: { children: ReactNode; delta: string; error: string; label: string; savedDate: string | null }) {
  return <article className="growth-step-card"><header className="growth-step-card__heading"><h2>{label}</h2>{savedDate && <time dateTime={savedDate} title={`最近保存的${label}测量日期 ${savedDate}`} aria-label={`最近保存的${label}记录，${savedDate}`}>{savedDate.slice(5).replace('-', '/')}</time>}</header><div>{children}</div><p>{delta}</p>{error && <em role="alert">{error}</em>}</article>
}
