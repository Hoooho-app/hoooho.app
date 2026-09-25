import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronRight, LineChart, Minus, Pencil, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import { heightMeasureLabel } from '../../features/health-profile/utils/childGrowthReference'
import { requiresMeasurementConfirmation } from '../../features/health-profile/utils/growthTrend'
import { getBasicHealthProfileValues } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { familyMemberService } from '../../services/familyMembers'
import { growthMeasurementService } from '../../services/growthMeasurements'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { validHeight } from './growthCardForm'
import { formatSigned, formatWeightKg, stepHeightValue, stepWeightKgValue, validWeightKg } from './growthUpdateForm'

const localToday = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Snapshot = { measuredAt: string; height: string; weightKg: string }

export function BasicHealthProfilePage({ member }: { member: Member }) {
  const navigate = useNavigate(), token = useAppStore((state) => state.authToken), members = useAppStore((state) => state.members), setMembers = useAppStore((state) => state.setMembers)
  const basic = useMemo(() => getBasicHealthProfileValues(member), [member])
  const [records, setRecords] = useState<GrowthMeasurementApiDto[]>([]), [loading, setLoading] = useState(true)
  const [measuredAt, setMeasuredAt] = useState(localToday()), [height, setHeight] = useState(String(basic.height ?? '')), [weightKg, setWeightKg] = useState(formatWeightKg(basic.weight))
  const [editing, setEditing] = useState<'height' | 'weight' | null>(null), [saveState, setSaveState] = useState<SaveState>('idle'), [message, setMessage] = useState('')
  const initialHeightRef = useRef<number | null>(validHeight(String(basic.height ?? '')) ? Number(basic.height) : null)
  const baselineRef = useRef<Snapshot>({ measuredAt: localToday(), height: String(basic.height ?? ''), weightKg: formatWeightKg(basic.weight) })

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setLoading(true)
    growthMeasurementService.list(member.id, token, controller.signal).then((items) => {
      const todayRecord = items.find((item) => item.measuredAt === localToday()), source = todayRecord ?? items[0]
      const nextHeight = source?.heightCm?.toFixed(1) ?? String(basic.height ?? ''), nextWeight = formatWeightKg(source?.weightKg ?? basic.weight)
      const snapshot = { measuredAt: localToday(), height: nextHeight, weightKg: nextWeight }
      setRecords(items); setMeasuredAt(snapshot.measuredAt); setHeight(snapshot.height); setWeightKg(snapshot.weightKg)
      initialHeightRef.current = validHeight(nextHeight) ? Number(nextHeight) : null; baselineRef.current = snapshot
    }).catch(() => { setSaveState('error'); setMessage('成长记录加载失败，请稍后重试') }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [member.id, token])

  const snapshot = { measuredAt, height, weightKg }, baseline = baselineRef.current
  const growthChanged = height !== baseline.height || weightKg !== baseline.weightKg || measuredAt !== baseline.measuredAt
  const dirty = growthChanged
  const heightValid = !height || validHeight(height), weightValid = !weightKg || validWeightKg(weightKg)
  const formValid = heightValid && weightValid && Boolean(height || weightKg)
  const previous = [...records].filter((item) => item.measuredAt < measuredAt).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]
  const heightDelta = validHeight(height) && previous?.heightCm != null ? Number(height) - previous.heightCm : null
  const weightDelta = validWeightKg(weightKg) && previous?.weightKg != null ? Number(weightKg) - previous.weightKg : null
  const heightAtFloor = initialHeightRef.current != null && Number(height) <= initialHeightRef.current

  const save = async () => {
    if (!token || !dirty || !formValid || saveState === 'saving') return
    setSaveState('saving'); setMessage('')
    try {
      let saved: GrowthMeasurementApiDto | null = null
      if (growthChanged) {
        const candidate = { measuredAt, heightCm: validHeight(height) ? Number(height) : null, weightKg: validWeightKg(weightKg) ? Number(weightKg) : null }
        const payload = { memberId: member.id, ...candidate, measurementType: heightMeasureLabel(member.birthday, measuredAt) === '身长' ? 'length' as const : 'height' as const, dataStatus: requiresMeasurementConfirmation(previous, candidate) ? 'pending_confirmation' as const : 'confirmed' as const, standardId: 'who-2006' as const }
        saved = await growthMeasurementService.upsert(payload, token)
        setRecords((items) => [saved!, ...items.filter((item) => item.id !== saved!.id)].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)))
      }
      const isLatestMeasurement = !records.some((item) => item.measuredAt > measuredAt)
      const heightCm = growthChanged && isLatestMeasurement ? saved?.heightCm ?? null : member.heightCm ?? null
      const savedWeightKg = growthChanged && isLatestMeasurement ? saved?.weightKg ?? null : member.weightKg ?? null
      const updated = await familyMemberService.update(member.id, { heightCm, weightKg: savedWeightKg }, token)
      setMembers(members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item))
      baselineRef.current = snapshot; setSaveState('saved'); setMessage('已保存，并加入成长记录')
    } catch (error) { setSaveState('error'); setMessage(error instanceof Error ? error.message : '保存失败，请检查后重试') }
  }

  return <main className="app-shell health-profile-detail-shell growth-update-page"><WebPageHeader fallback="/health-profile" title="基础信息" /><div className="page-content growth-update-content">
    <button className="growth-record-entry" onClick={() => navigate('/health-profile/growth')} type="button"><i><LineChart aria-hidden="true" /></i><span><strong>成长记录</strong><small>查看记录与成长曲线</small></span><ChevronRight aria-hidden="true" /></button>
    <section className="growth-update-form" aria-busy={loading}><header><h1>更新成长数据</h1><input aria-label="测量日期" max={localToday()} onChange={(event) => { setMeasuredAt(event.target.value); setSaveState('idle') }} type="date" value={measuredAt} /></header>
      <div className="growth-step-grid"><GrowthStepCard delta={heightDelta == null ? '暂无上次记录' : `较上次 ${formatSigned(heightDelta)} cm`} error={!heightValid ? '请输入 20–260 cm' : ''} label="身高">
        <button aria-label="身高减少0.1厘米" disabled={!validHeight(height) || heightAtFloor} onClick={() => { setHeight(stepHeightValue(height, -1, initialHeightRef.current)); setSaveState('idle') }} type="button"><Minus /></button>{editing === 'height' ? <input aria-label="手动编辑身高 cm" autoFocus inputMode="decimal" max="260" min="20" onBlur={() => setEditing(null)} onChange={(event) => { setHeight(event.target.value); setSaveState('idle') }} step="0.1" type="number" value={height} /> : <button className="growth-step-value" onClick={() => setEditing('height')} type="button"><strong>{height || '—'}</strong><small>cm</small><Pencil aria-hidden="true" /></button>}<button aria-label="身高增加0.1厘米" disabled={!validHeight(height)} onClick={() => { setHeight(stepHeightValue(height, 1, initialHeightRef.current)); setSaveState('idle') }} type="button"><Plus /></button>
      </GrowthStepCard><GrowthStepCard delta={weightDelta == null ? '暂无上次记录' : `较上次 ${formatSigned(weightDelta)} kg`} error={!weightValid ? '请输入 1–500 kg，保留 1 位小数' : ''} label="体重">
        <button aria-label="体重减少0.1千克" disabled={!validWeightKg(weightKg) || Number(weightKg) <= 1} onClick={() => { setWeightKg(stepWeightKgValue(weightKg, -1)); setSaveState('idle') }} type="button"><Minus /></button>{editing === 'weight' ? <input aria-label="手动编辑体重 kg" autoFocus inputMode="decimal" max="500" min="1" onBlur={() => setEditing(null)} onChange={(event) => { setWeightKg(event.target.value); setSaveState('idle') }} step="0.1" type="number" value={weightKg} /> : <button className="growth-step-value" onClick={() => setEditing('weight')} type="button"><strong>{weightKg || '—'}</strong><small>kg</small><Pencil aria-hidden="true" /></button>}<button aria-label="体重增加0.1千克" disabled={!validWeightKg(weightKg)} onClick={() => { setWeightKg(stepWeightKgValue(weightKg, 1)); setSaveState('idle') }} type="button"><Plus /></button>
      </GrowthStepCard></div>
      <HohoButton className="growth-update-save" disabled={!dirty || !formValid} fullWidth loading={saveState === 'saving'} onClick={() => void save()} size="large">保存本次更新</HohoButton>
      <p className={`growth-update-message growth-update-message--${saveState}`} aria-live="polite">{saveState === 'saved' && <Check aria-hidden="true" />}{message}</p>
    </section>
  </div></main>
}

function GrowthStepCard({ children, delta, error, label }: { children: ReactNode; delta: string; error: string; label: string }) {
  return <article className="growth-step-card"><h2>{label}</h2><div>{children}</div><p>{delta}</p>{error && <em role="alert">{error}</em>}</article>
}
