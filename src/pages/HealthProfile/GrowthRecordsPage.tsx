import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { calculateGrowthPosition, exactAgeInMonths, heightMeasureLabel } from '../../features/health-profile/utils/childGrowthReference'
import { resolveCurrentGrowthMeasurements } from '../../features/health-profile/utils/resolveCurrentGrowthMeasurements'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { familyMemberService } from '../../services/familyMembers'
import { growthMeasurementService } from '../../services/growthMeasurements'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { GrowthMeasurementApiDto } from '../../types'
import { validHeight } from './growthCardForm'
import type { GrowthMeasure } from './growthInterpretation'
import { formatWeightKg, validWeightKg } from './growthUpdateForm'

type RouteState = { selectedMeasure?: GrowthMeasure; tab?: 'list' | GrowthMeasure; returnTo?: unknown }
const today = () => new Date().toISOString().slice(0, 10)
const ageText = (birthday: string | undefined, date: string) => { const months = exactAgeInMonths(birthday, date); return months == null ? '年龄未知' : `${Math.floor(months / 12)}岁${Math.floor(months % 12)}个月` }
const sortedRecords = (items: GrowthMeasurementApiDto[]) => [...items].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || b.createdAt.localeCompare(a.createdAt))

export function GrowthRecordsPage() {
  const member = useCurrentMember(), token = useAppStore((state) => state.authToken), setMembers = useAppStore((state) => state.setMembers), navigate = useNavigate(), location = useLocation()
  const navigationState = location.state as RouteState | null
  const selectedMeasure = navigationState?.selectedMeasure ?? (navigationState?.tab === 'weight' ? 'weight' : 'height')
  const returnTo = typeof navigationState?.returnTo === 'string' && navigationState.returnTo.startsWith('/') ? navigationState.returnTo : ''
  const [records, setRecords] = useState<GrowthMeasurementApiDto[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [editing, setEditing] = useState<GrowthMeasurementApiDto | null | 'new'>(null)

  const load = () => {
    if (!token) return
    const openedMemberId = member.id
    setLoading(true); setError('')
    const controller = new AbortController()
    growthMeasurementService.list(openedMemberId, token, controller.signal).then((items) => {
      if (useAppStore.getState().currentMemberId === openedMemberId) setRecords(sortedRecords(items))
    }).catch((reason) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : '成长记录加载失败')
    }).finally(() => { if (useAppStore.getState().currentMemberId === openedMemberId) setLoading(false) })
    return () => controller.abort()
  }
  useEffect(load, [member.id, token])

  const syncMember = async (nextRecords: GrowthMeasurementApiDto[]) => {
    if (!token || useAppStore.getState().currentMemberId !== member.id) return
    const current = resolveCurrentGrowthMeasurements(member, nextRecords, member.id)
    const updated = await familyMemberService.update(member.id, current, token)
    if (useAppStore.getState().currentMemberId !== member.id) return
    const store = useAppStore.getState(); setMembers(store.members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item))
  }
  const remove = async (record: GrowthMeasurementApiDto) => {
    if (!token || !window.confirm(`确认删除 ${record.measuredAt} 的成长记录吗？删除后曲线与解读会按剩余记录重新计算。`)) return
    try {
      await growthMeasurementService.delete(record.id, token)
      if (useAppStore.getState().currentMemberId !== member.id) return
      const nextRecords = records.filter((item) => item.id !== record.id)
      setRecords(nextRecords)
      try { await syncMember(nextRecords) } catch { setError('记录已删除，但基础资料同步失败，请稍后刷新') }
    } catch { setError('删除失败，原记录已保留，请检查网络后重试') }
  }
  const saved = (record: GrowthMeasurementApiDto) => {
    if (useAppStore.getState().currentMemberId !== member.id) return
    const nextRecords = sortedRecords([record, ...records.filter((item) => item.id !== record.id)])
    setRecords(nextRecords); setEditing(null); setError(''); void syncMember(nextRecords).catch(() => setError('记录已保存，但基础资料同步失败，请稍后刷新'))
  }
  const back = () => navigate('/health-profile/basic', { replace: true, state: { selectedMeasure, returnTo } })

  if (navigationState?.tab === 'height' || navigationState?.tab === 'weight') return <Navigate replace state={{ selectedMeasure: navigationState.tab, returnTo }} to="/health-profile/basic" />

  return <main className="app-shell health-profile-detail-shell growth-records-page"><WebPageHeader fallback="/health-profile/basic" onBack={back} title="记录列表" action={<button className="growth-header-add" onClick={() => setEditing('new')} type="button"><Plus size={15} />添加</button>} /><div className="page-content growth-records-content">
    <p className="growth-record-list-summary">共 {records.length} 条成长记录，可直接编辑或删除。</p>
    {loading ? <p className="growth-loading">正在加载成长记录…</p> : error && !records.length ? <button className="growth-retry" onClick={load} type="button">{error}，点击重试</button> : <section className="growth-record-list">
      {error && <p className="growth-record-error" role="alert">{error}</p>}
      {!records.length ? <div className="growth-empty-state"><h2>还没有成长记录</h2><p>添加第一次测量，建立孩子自己的成长轨迹。</p><button onClick={() => setEditing('new')} type="button">添加记录</button></div> : records.map((record, index) => {
        const h = record.heightCm == null ? null : calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: record.measuredAt, measure: 'height', value: record.heightCm })
        const w = record.weightKg == null ? null : calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: record.measuredAt, measure: 'weight', value: record.weightKg })
        return <article className="growth-record-row growth-record-row--managed" key={record.id}><div className="growth-record-row__date"><strong>{index === 0 ? '最新 · ' : ''}{record.measuredAt}</strong><small>{ageText(member.birthday, record.measuredAt)}</small></div><div className="growth-record-actions"><button onClick={() => setEditing(record)} type="button"><Pencil aria-hidden="true" />编辑</button><button onClick={() => void remove(record)} type="button"><Trash2 aria-hidden="true" />删除</button></div><div className="growth-record-values"><span>{heightMeasureLabel(member.birthday, record.measuredAt)}<strong>{record.heightCm == null ? '—' : `${record.heightCm.toFixed(1)} cm`} {h ? `· ${h.percentileLabel}` : ''}</strong></span><span>体重<strong>{record.weightKg == null ? '—' : `${record.weightKg.toFixed(1)} kg`} {w ? `· ${w.percentileLabel}` : ''}</strong></span></div>{record.dataStatus === 'pending_confirmation' && <em>待确认</em>}<small>参考：WHO 儿童生长标准</small></article>
      })}
    </section>}
  </div>{editing && <GrowthRecordEditor initial={editing === 'new' ? null : editing} memberId={member.id} onClose={() => setEditing(null)} onSaved={saved} token={token ?? ''} birthday={member.birthday} />}</main>
}

function GrowthRecordEditor({ birthday, initial, memberId, onClose, onSaved, token }: { birthday?: string; initial: GrowthMeasurementApiDto | null; memberId: string; onClose: () => void; onSaved: (value: GrowthMeasurementApiDto) => void; token: string }) {
  const [date, setDate] = useState(initial?.measuredAt ?? today()), [height, setHeight] = useState(initial?.heightCm?.toFixed(1) ?? ''), [weight, setWeight] = useState(formatWeightKg(initial?.weightKg)), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const heightValid = !height || validHeight(height), weightValid = !weight || validWeightKg(weight)
  const save = async () => {
    if (!heightValid || !weightValid || (!height && !weight)) return
    setSaving(true); setError('')
    try {
      const input = { memberId, measuredAt: date, measurementType: heightMeasureLabel(birthday, date) === '身长' ? 'length' as const : 'height' as const, heightCm: height ? Number(height) : null, weightKg: weight ? Number(weight) : null, dataStatus: initial?.dataStatus ?? 'confirmed' as const, standardId: 'who-2006' as const }
      onSaved(initial ? await growthMeasurementService.update(initial.id, input, token) : await growthMeasurementService.upsert(input, token))
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，当前填写内容已保留') } finally { setSaving(false) }
  }
  return <div className="growth-editor-backdrop"><section aria-modal="true" className="growth-editor-sheet" role="dialog"><header><h2>{initial ? '编辑成长记录' : '添加成长记录'}</h2><button aria-label="关闭" onClick={onClose} type="button"><X /></button></header><label>测量日期<input max={today()} onChange={(event) => setDate(event.target.value)} type="date" value={date} /></label><div><label>{heightMeasureLabel(birthday, date)}（cm）<input inputMode="decimal" max="260" min="20" onChange={(event) => setHeight(event.target.value)} step="0.1" type="number" value={height} /></label><label>体重（kg）<input inputMode="decimal" max="500" min="1" onChange={(event) => setWeight(event.target.value)} step="0.1" type="number" value={weight} /></label></div>{(!heightValid || !weightValid) && <p role="alert">请输入合理的身高或体重，最多保留 1 位小数。</p>}{error && <p role="alert">{error}</p>}<button disabled={saving || !heightValid || !weightValid || (!height && !weight)} onClick={() => void save()} type="button">{saving ? '保存中…' : '保存记录'}</button></section></div>
}
