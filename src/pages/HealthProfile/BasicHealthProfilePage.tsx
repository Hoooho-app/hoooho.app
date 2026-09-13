import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, LineChart, Minus, Pencil, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, WebPageHeader } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import { heightMeasureLabel } from '../../features/health-profile/utils/childGrowthReference'
import { requiresMeasurementConfirmation } from '../../features/health-profile/utils/growthTrend'
import { getBasicHealthProfileValues } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { familyMemberService } from '../../services/familyMembers'
import { growthMeasurementService } from '../../services/growthMeasurements'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { validHeight } from './growthCardForm'
import { formatSigned, gramsToKg, kgToGrams, stepHeightValue, stepWeightGramsValue, validWeightGrams } from './growthUpdateForm'

const localToday = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }
const genderLabel = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Snapshot = { measuredAt: string; height: string; weightGrams: string; abo: string; rh: string }

export function BasicHealthProfilePage({ member }: { member: Member }) {
  const navigate = useNavigate(), token = useAppStore((state) => state.authToken), members = useAppStore((state) => state.members), setMembers = useAppStore((state) => state.setMembers)
  const basic = useMemo(() => getBasicHealthProfileValues(member), [member])
  const [records, setRecords] = useState<GrowthMeasurementApiDto[]>([]), [loading, setLoading] = useState(true)
  const [measuredAt, setMeasuredAt] = useState(localToday()), [height, setHeight] = useState(String(basic.height ?? '')), [weightGrams, setWeightGrams] = useState(kgToGrams(Number(basic.weight || 0) || null))
  const [abo, setAbo] = useState(String(basic.aboBloodType ?? '')), [rh, setRh] = useState(String(basic.rhBloodType ?? 'unknown')), [rhOpen, setRhOpen] = useState(false)
  const [editing, setEditing] = useState<'height' | 'weight' | null>(null), [saveState, setSaveState] = useState<SaveState>('idle'), [message, setMessage] = useState('')
  const initialHeightRef = useRef<number | null>(validHeight(String(basic.height ?? '')) ? Number(basic.height) : null)
  const baselineRef = useRef<Snapshot>({ measuredAt: localToday(), height: String(basic.height ?? ''), weightGrams: kgToGrams(Number(basic.weight || 0) || null), abo: String(basic.aboBloodType ?? ''), rh: String(basic.rhBloodType ?? 'unknown') })

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setLoading(true)
    growthMeasurementService.list(member.id, token, controller.signal).then((items) => {
      const todayRecord = items.find((item) => item.measuredAt === localToday()), source = todayRecord ?? items[0]
      const nextHeight = source?.heightCm?.toFixed(1) ?? String(basic.height ?? ''), nextWeight = kgToGrams(source?.weightKg ?? (Number(basic.weight || 0) || null))
      const snapshot = { measuredAt: localToday(), height: nextHeight, weightGrams: nextWeight, abo: String(basic.aboBloodType ?? ''), rh: String(basic.rhBloodType ?? 'unknown') }
      setRecords(items); setMeasuredAt(snapshot.measuredAt); setHeight(snapshot.height); setWeightGrams(snapshot.weightGrams); setAbo(snapshot.abo); setRh(snapshot.rh)
      initialHeightRef.current = validHeight(nextHeight) ? Number(nextHeight) : null; baselineRef.current = snapshot
    }).catch(() => { setSaveState('error'); setMessage('成长记录加载失败，请稍后重试') }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [member.id, token])

  const snapshot = { measuredAt, height, weightGrams, abo, rh }, baseline = baselineRef.current
  const growthChanged = height !== baseline.height || weightGrams !== baseline.weightGrams || measuredAt !== baseline.measuredAt
  const bloodChanged = abo !== baseline.abo || rh !== baseline.rh, dirty = growthChanged || bloodChanged
  const heightValid = !height || validHeight(height), weightValid = !weightGrams || validWeightGrams(weightGrams)
  const formValid = growthChanged ? heightValid && weightValid && Boolean(height || weightGrams) : bloodChanged
  const previous = [...records].filter((item) => item.measuredAt < measuredAt).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]
  const heightDelta = validHeight(height) && previous?.heightCm != null ? Number(height) - previous.heightCm : null
  const weightDelta = validWeightGrams(weightGrams) && previous?.weightKg != null ? Number(weightGrams) - Number(kgToGrams(previous.weightKg)) : null
  const heightAtFloor = initialHeightRef.current != null && Number(height) <= initialHeightRef.current

  const save = async () => {
    if (!token || !dirty || !formValid || saveState === 'saving') return
    setSaveState('saving'); setMessage('')
    try {
      let saved: GrowthMeasurementApiDto | null = null
      if (growthChanged) {
        const candidate = { measuredAt, heightCm: validHeight(height) ? Number(height) : null, weightKg: validWeightGrams(weightGrams) ? gramsToKg(weightGrams) : null }
        const payload = { memberId: member.id, ...candidate, measurementType: heightMeasureLabel(member.birthday, measuredAt) === '身长' ? 'length' as const : 'height' as const, dataStatus: requiresMeasurementConfirmation(previous, candidate) ? 'pending_confirmation' as const : 'confirmed' as const, standardId: 'who-2006' as const }
        saved = await growthMeasurementService.upsert(payload, token)
        setRecords((items) => [saved!, ...items.filter((item) => item.id !== saved!.id)].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)))
      }
      const isLatestMeasurement = !records.some((item) => item.measuredAt > measuredAt)
      const heightCm = growthChanged && isLatestMeasurement ? saved?.heightCm ?? null : member.heightCm ?? null
      const weightKg = growthChanged && isLatestMeasurement ? saved?.weightKg ?? null : member.weightKg ?? null
      const updated = await familyMemberService.update(member.id, { heightCm, weightKg, bloodType: (abo || null) as 'A' | 'B' | 'AB' | 'O' | null, rhBloodType: rh === 'unknown' ? null : rh as 'positive' | 'negative' }, token)
      setMembers(members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item))
      baselineRef.current = snapshot; setSaveState('saved'); setMessage('已保存，并加入成长记录')
    } catch (error) { setSaveState('error'); setMessage(error instanceof Error ? error.message : '保存失败，请检查后重试') }
  }

  return <main className="app-shell health-profile-detail-shell growth-update-page"><WebPageHeader fallback="/health-profile" title="基础信息" /><div className="page-content growth-update-content">
    <section className="growth-update-member"><Avatar name={member.name} size="lg" src={member.avatar} /><span><strong>{member.name}</strong><small>{genderLabel[member.gender ?? '']} · {member.birthday ? formatAgeFromBirthday(member.birthday) : member.age}</small></span></section>
    <button className="growth-record-entry" onClick={() => navigate('/health-profile/growth')} type="button"><i><LineChart aria-hidden="true" /></i><span><strong>成长记录</strong><small>查看记录与成长曲线</small></span><ChevronRight aria-hidden="true" /></button>
    <section className="growth-update-form" aria-busy={loading}><header><h1>更新成长数据</h1><label>测量日期 <input aria-label="测量日期" max={localToday()} onChange={(event) => { setMeasuredAt(event.target.value); setSaveState('idle') }} type="date" value={measuredAt} /></label></header>
      <div className="growth-step-grid"><GrowthStepCard delta={heightDelta == null ? '暂无上次记录' : `较上次 ${formatSigned(heightDelta)} cm`} error={!heightValid ? '请输入 20–260 cm' : ''} label={heightMeasureLabel(member.birthday, measuredAt)}>
        <button aria-label="身高减少0.1厘米" disabled={!validHeight(height) || heightAtFloor} onClick={() => { setHeight(stepHeightValue(height, -1, initialHeightRef.current)); setSaveState('idle') }} type="button"><Minus /></button>{editing === 'height' ? <input aria-label="手动编辑身高 cm" autoFocus inputMode="decimal" max="260" min="20" onBlur={() => setEditing(null)} onChange={(event) => { setHeight(event.target.value); setSaveState('idle') }} step="0.1" type="number" value={height} /> : <button className="growth-step-value" onClick={() => setEditing('height')} type="button"><strong>{height || '—'}</strong><small>cm</small><Pencil aria-hidden="true" /></button>}<button aria-label="身高增加0.1厘米" disabled={!validHeight(height)} onClick={() => { setHeight(stepHeightValue(height, 1, initialHeightRef.current)); setSaveState('idle') }} type="button"><Plus /></button>
      </GrowthStepCard><GrowthStepCard delta={weightDelta == null ? '暂无上次记录' : `较上次 ${formatSigned(weightDelta, 0)} g`} error={!weightValid ? '请输入 1000–500000 的整数克' : ''} label="体重">
        <button aria-label="体重减少1克" disabled={!validWeightGrams(weightGrams) || Number(weightGrams) <= 1000} onClick={() => { setWeightGrams(stepWeightGramsValue(weightGrams, -1)); setSaveState('idle') }} type="button"><Minus /></button>{editing === 'weight' ? <input aria-label="手动编辑体重 g" autoFocus inputMode="numeric" max="500000" min="1000" onBlur={() => setEditing(null)} onChange={(event) => { setWeightGrams(event.target.value); setSaveState('idle') }} step="1" type="number" value={weightGrams} /> : <button className="growth-step-value" onClick={() => setEditing('weight')} type="button"><strong>{weightGrams || '—'}</strong><small>g</small><Pencil aria-hidden="true" /></button>}<button aria-label="体重增加1克" disabled={!validWeightGrams(weightGrams)} onClick={() => { setWeightGrams(stepWeightGramsValue(weightGrams, 1)); setSaveState('idle') }} type="button"><Plus /></button>
      </GrowthStepCard></div><p className="growth-edit-hint">点击数值可手动编辑</p>
      <fieldset className="growth-update-blood"><legend>血型</legend>{['A','B','AB','O'].map((value) => <button aria-pressed={abo === value} key={value} onClick={() => { setAbo(value); setSaveState('idle') }} type="button">{value}</button>)}<span><button aria-expanded={rhOpen} onClick={() => setRhOpen((value) => !value)} type="button">{rh === 'positive' ? 'Rh+' : rh === 'negative' ? 'Rh−' : 'Rh未知'}<ChevronDown /></button>{rhOpen && <div role="dialog" aria-label="Rh血型"><button aria-pressed={rh === 'positive'} onClick={() => { setRh('positive'); setRhOpen(false); setSaveState('idle') }} type="button">Rh+</button><button aria-pressed={rh === 'negative'} onClick={() => { setRh('negative'); setRhOpen(false); setSaveState('idle') }} type="button">Rh−</button><button aria-pressed={rh === 'unknown'} onClick={() => { setRh('unknown'); setRhOpen(false); setSaveState('idle') }} type="button">未知</button></div>}</span></fieldset>
      <HohoButton className="growth-update-save" disabled={!dirty || !formValid} fullWidth loading={saveState === 'saving'} onClick={() => void save()} size="large">保存本次更新</HohoButton>
      <p className={`growth-update-message growth-update-message--${saveState}`} aria-live="polite">{saveState === 'saved' && <Check aria-hidden="true" />}{message}</p>
    </section>
  </div></main>
}

function GrowthStepCard({ children, delta, error, label }: { children: ReactNode; delta: string; error: string; label: string }) {
  return <article className="growth-step-card"><h2>{label}</h2><div>{children}</div><p>{delta}</p>{error && <em role="alert">{error}</em>}</article>
}
