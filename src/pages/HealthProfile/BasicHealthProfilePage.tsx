import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Info, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, WebPageHeader } from '../../components/common'
import { calculateGrowthPosition, heightMeasureLabel } from '../../features/health-profile/utils/childGrowthReference'
import { decorateGrowthRecords, growthPositionBand, growthTrend, requiresMeasurementConfirmation } from '../../features/health-profile/utils/growthTrend'
import { formatBloodTypeDisplay, getBasicHealthProfileValues } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { familyMemberService } from '../../services/familyMembers'
import { growthMeasurementService } from '../../services/growthMeasurements'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { readProfileSection } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { validHeight, validWeight } from './growthCardForm'

const localToday = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }
const genderLabel = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function BasicHealthProfilePage({ member }: { member: Member }) {
  const navigate = useNavigate(), token = useAppStore((state) => state.authToken), members = useAppStore((state) => state.members), setMembers = useAppStore((state) => state.setMembers)
  const basic = useMemo(() => getBasicHealthProfileValues(member), [member])
  const [measuredAt, setMeasuredAt] = useState(localToday()), [height, setHeight] = useState(String(basic.height ?? '')), [weight, setWeight] = useState(String(basic.weight ?? ''))
  const [abo, setAbo] = useState(String(basic.aboBloodType ?? '')), [rh, setRh] = useState(String(basic.rhBloodType ?? '')), [rhOpen, setRhOpen] = useState(false)
  const [records, setRecords] = useState<GrowthMeasurementApiDto[]>([]), [saveState, setSaveState] = useState<SaveState>('idle'), [saveError, setSaveError] = useState('')
  const [savedMeasurement, setSavedMeasurement] = useState<GrowthMeasurementApiDto | null>(null), [calculating, setCalculating] = useState(false)
  const debounceRef = useRef<number>(), calculationRef = useRef<number>(), requestRef = useRef(0), mountedRef = useRef(true)
  const draftRef = useRef({ measuredAt, height, weight })
  const label = heightMeasureLabel(member.birthday, measuredAt)
  useEffect(() => { draftRef.current = { measuredAt, height, weight } }, [height, measuredAt, weight])

  useEffect(() => {
    mountedRef.current = true
    if (!token) return
    const controller = new AbortController()
    growthMeasurementService.list(member.id, token, controller.signal).then(async (items) => {
      if (!items.length && (validHeight(String(basic.height ?? '')) || validWeight(String(basic.weight ?? '')))) {
        let legacy: Record<string, string> = {}
        try { legacy = JSON.parse(readProfileSection(`hoho-health-profile:${member.id}:basic`))[0] ?? {} } catch { /* Never invent a historical date. */ }
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(legacy.measurementDate ?? ''))) {
          const legacyDate = String(legacy.measurementDate)
          items = [await growthMeasurementService.upsert({ memberId: member.id, measuredAt: legacyDate, measurementType: heightMeasureLabel(member.birthday, legacyDate) === '身长' ? 'length' : 'height', heightCm: validHeight(String(basic.height ?? '')) ? Number(basic.height) : null, weightKg: validWeight(String(basic.weight ?? '')) ? Number(basic.weight) : null, dataStatus: 'confirmed', standardId: 'who-2006' }, token, controller.signal)]
        }
      }
      const selected = items.find((item) => item.measuredAt === localToday()) ?? items[0]
      setRecords(items)
      if (selected) { setMeasuredAt(selected.measuredAt); setHeight(selected.heightCm?.toString() ?? ''); setWeight(selected.weightKg?.toString() ?? ''); setSavedMeasurement(selected) }
    }).catch(() => setSaveError('成长记录暂时无法加载，请稍后重试'))
    return () => { mountedRef.current = false; controller.abort(); if (debounceRef.current) window.clearTimeout(debounceRef.current); if (calculationRef.current) window.clearTimeout(calculationRef.current) }
    // A profile update after autosave must not reload this screen and jump to another date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id, token])

  const showCalculated = () => { setCalculating(true); if (calculationRef.current) window.clearTimeout(calculationRef.current); calculationRef.current = window.setTimeout(() => setCalculating(false), 220) }
  const saveBlood = async (nextAbo = abo, nextRh = rh) => {
    if (!token) return
    setSaveState('saving'); setSaveError('')
    try {
      const updated = await familyMemberService.update(member.id, { bloodType: (nextAbo || null) as 'A' | 'B' | 'AB' | 'O' | null, rhBloodType: (nextRh || null) as 'positive' | 'negative' | null }, token)
      if (!mountedRef.current) return
      setMembers(members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item)); setSaveState('saved')
    } catch (error) { if (mountedRef.current) { setSaveState('error'); setSaveError(error instanceof Error ? error.message : '保存失败，点击重试') } }
  }
  const saveMeasurement = async (overrides: Partial<{ measuredAt: string; height: string; weight: string }> = {}) => {
    const draft = { ...draftRef.current, ...overrides }
    if (!token || (!validHeight(draft.height) && !validWeight(draft.weight))) return
    const request = ++requestRef.current
    setSaveState('saving'); setSaveError('')
    try {
      const candidate = { measuredAt: draft.measuredAt, heightCm: validHeight(draft.height) ? Number(draft.height) : null, weightKg: validWeight(draft.weight) ? Number(draft.weight) : null }
      const previous = [...records].filter((item) => item.measuredAt < draft.measuredAt).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]
      const payload = { memberId: member.id, ...candidate, measurementType: heightMeasureLabel(member.birthday, draft.measuredAt) === '身长' ? 'length' as const : 'height' as const, dataStatus: requiresMeasurementConfirmation(previous, candidate) ? 'pending_confirmation' as const : 'confirmed' as const, standardId: 'who-2006' as const }
      const saved = savedMeasurement && savedMeasurement.measuredAt !== draft.measuredAt ? await growthMeasurementService.update(savedMeasurement.id, payload, token) : await growthMeasurementService.upsert(payload, token)
      if (!mountedRef.current || request !== requestRef.current) return
      setSavedMeasurement(saved); setRecords((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))); setSaveState('saved'); showCalculated()
      const updated = await familyMemberService.update(member.id, { heightCm: saved.heightCm, weightKg: saved.weightKg }, token)
      if (mountedRef.current) setMembers(members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item))
    } catch (error) { if (mountedRef.current && request === requestRef.current) { setSaveState('error'); setSaveError(error instanceof Error ? error.message : '保存失败，点击重试') } }
  }
  const scheduleSave = () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); debounceRef.current = window.setTimeout(() => void saveMeasurement(), 700) }
  const selectAbo = (value: string) => { const next = abo === value ? '' : value; setAbo(next); void saveBlood(next, rh) }
  const selectRh = (value: string) => { const next = rh === value ? '' : value; setRh(next); setRhOpen(false); void saveBlood(abo, next) }
  const displayRecord = savedMeasurement
  const hResult = displayRecord?.heightCm == null ? null : calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: displayRecord.measuredAt, measure: 'height', value: displayRecord.heightCm })
  const wResult = displayRecord?.weightKg == null ? null : calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: displayRecord.measuredAt, measure: 'weight', value: displayRecord.weightKg })
  const trend = growthTrend(decorateGrowthRecords(records, member)), hasResult = Boolean(displayRecord && (hResult || wResult))

  return <main className="app-shell health-profile-detail-shell growth-auto-page"><WebPageHeader fallback="/health-profile" title="基础健康信息" /><div className="page-content growth-auto-content">
    <section className={`growth-result-card ${hasResult ? 'growth-result-card--ready' : ''}`} aria-busy={calculating}><header><Avatar name={member.name} size="md" src={member.avatar} /><span><strong>{member.name}</strong><small>{genderLabel[member.gender ?? '']} · {member.birthday ? formatAgeFromBirthday(member.birthday) : member.age}</small></span></header><div className="growth-result-card__heading"><span><h1>{hasResult ? '今日成长落点' : '看看今天长到哪里了'}</h1><p>{hasResult ? `测量日期：${displayRecord?.measuredAt === localToday() ? '今天' : displayRecord?.measuredAt}` : `填入${label}和体重，答案马上出现`}</p></span>{calculating && <small><span className="growth-saving-dot" />正在更新</small>}</div>{hasResult && <div className="growth-result-values">{displayRecord?.heightCm != null && <article><small>{heightMeasureLabel(member.birthday, displayRecord.measuredAt)}</small><strong>{displayRecord.heightCm}<i>cm</i></strong><span>{hResult ? `约${hResult.percentileLabel}` : '暂无参考位置'}</span></article>}{displayRecord?.weightKg != null && <article><small>体重</small><strong>{displayRecord.weightKg}<i>kg</i></strong><span>{wResult ? `约${wResult.percentileLabel}` : '暂无参考位置'}</span></article>}</div>}{hasResult && <><p className="growth-result-band">{growthPositionBand(hResult, wResult)}</p><div className="growth-result-actions"><button onClick={() => navigate('/health-profile/growth')} type="button">查看成长记录</button><button onClick={() => navigate('/health-profile/growth', { state: { tab: 'height' } })} type="button">查看完整成长曲线</button>{trend.triggerReassurance && <button onClick={() => navigate('/health-profile/growth/reassurance')} type="button">看看成长安心解读</button>}</div></>}</section>
    <div className="growth-auto-fields"><label><span>{label}</span><span><input aria-label={`${label} cm`} inputMode="decimal" max="260" min="20" onBlur={() => void saveMeasurement()} onChange={(event) => { const next = event.target.value; draftRef.current.height = next; setHeight(next); setSaveState('idle'); scheduleSave() }} step="0.1" type="number" value={height} /><small>cm</small></span></label><label><span>体重</span><span><input aria-label="体重 kg" inputMode="decimal" max="500" min="1" onBlur={() => void saveMeasurement()} onChange={(event) => { const next = event.target.value; draftRef.current.weight = next; setWeight(next); setSaveState('idle'); scheduleSave() }} step="0.1" type="number" value={weight} /><small>kg</small></span></label></div>
    <fieldset className="growth-inline-blood"><legend>血型（选填）</legend>{['A','B','AB','O'].map((value) => <button aria-pressed={abo === value} key={value} onClick={() => selectAbo(value)} type="button">{value}型</button>)}<span className="growth-rh-anchor"><button aria-expanded={rhOpen} onClick={() => setRhOpen((open) => !open)} type="button">{rh === 'positive' ? 'Rh+' : rh === 'negative' ? 'Rh−' : 'Rh'}<ChevronDown size={14} /></button>{rhOpen && <div className="growth-rh-menu" role="dialog" aria-label="Rh血型"><strong>Rh血型</strong><button aria-pressed={rh === 'positive'} onClick={() => selectRh('positive')} type="button">阳性（Rh+）</button><button aria-pressed={rh === 'negative'} onClick={() => selectRh('negative')} type="button">阴性（Rh−）</button><button onClick={() => selectRh('')} type="button">清除</button></div>}</span></fieldset>
    <label className="growth-measured-date"><span>测量日期</span><input max={localToday()} onChange={(event) => { const next = event.target.value; draftRef.current.measuredAt = next; setMeasuredAt(next); setSaveState('idle'); void saveMeasurement({ measuredAt: next }) }} type="date" value={measuredAt} /></label>
    <div className={`growth-save-state growth-save-state--${saveState}`} aria-live="polite">{saveState === 'saving' ? <><span className="growth-saving-dot" />保存中…</> : saveState === 'saved' ? <><Check size={15} />已保存 ✓</> : saveState === 'error' ? <button onClick={() => void saveMeasurement()} type="button"><RotateCcw size={15} />{saveError || '保存失败，点击重试'}</button> : <><Info size={15} />填写后自动保存</>}</div>
    {records.length > 0 && <p className="growth-current-blood">当前血型：{formatBloodTypeDisplay(abo, rh) || '未填写'}</p>}
  </div></main>
}
