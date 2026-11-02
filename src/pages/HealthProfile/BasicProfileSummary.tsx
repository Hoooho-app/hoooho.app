import { useEffect, useState } from 'react'
import { resolveCurrentGrowthSnapshot } from '../../features/health-profile/utils/resolveCurrentGrowthMeasurements'
import { growthMeasurementService } from '../../services/growthMeasurements'
import { subscribeProfileSectionInvalidation } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'

/** Read-only overview; editing stays in the existing identity and growth pages. */
export function BasicProfileSummary({ member }: { member: Member }) {
  const token = useAppStore(state => state.authToken)
  const [measurements, setMeasurements] = useState<GrowthMeasurementApiDto[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    const unsubscribe = subscribeProfileSectionInvalidation(refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('hoooho-data-changed', refresh)
    return () => { unsubscribe(); window.removeEventListener('focus', refresh); window.removeEventListener('hoooho-data-changed', refresh) }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    if (token) void growthMeasurementService.list(member.id, token, controller.signal).then(items => {
      if (!controller.signal.aborted) { setMeasurements(items); setStatus('ready') }
    }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [member.id, token, revision])

  const snapshot = resolveCurrentGrowthSnapshot(member, measurements, member.id)
  const metric = (label: string, value: number | null, unit: string, date: string | null, key: 'heightCm' | 'weightKg') => {
    const pending = date && measurements.some(item => item.memberId === member.id && item.measuredAt === date && item[key] === value && item.dataStatus === 'pending_confirmation')
    return <div><dt>{label}</dt><dd>{status !== 'ready' ? <span className="health-profile-summary__empty">{status === 'loading' ? '读取中…' : '暂不可用'}</span> : value == null ? <span className="health-profile-summary__empty">未填写</span> : <>{value.toFixed(1)}<span className="health-profile-summary__unit">{unit}</span></>}</dd>{status === 'ready' && date && <small>{date}{pending ? ' · 待确认' : ''}</small>}</div>
  }
  const age = member.birthday ? formatAgeFromBirthday(member.birthday) : ''
  return <div className="health-profile-summary-wrap">
    <dl className="health-profile-summary" aria-label="基本资料摘要">
      <div><dt>年龄</dt><dd className="health-profile-summary__text">{age && age !== '未填写年龄' ? age : <span className="health-profile-summary__empty">未填写</span>}</dd></div>
      <div><dt>血型</dt><dd className="health-profile-summary__text">{member.bloodType ? `${member.bloodType}型` : <span className="health-profile-summary__empty">未填写</span>}</dd>{member.rhBloodType && <small>RhD {member.rhBloodType === 'positive' ? '阳性' : '阴性'}</small>}</div>
      {metric('身高', snapshot.heightCm, 'cm', snapshot.heightMeasuredAt, 'heightCm')}
      {metric('体重', snapshot.weightKg, 'kg', snapshot.weightMeasuredAt, 'weightKg')}
    </dl>
    {status === 'error' && <p className="health-profile-summary__error" role="alert">身高、体重读取失败<button type="button" onClick={() => setRevision(value => value + 1)}>重试</button></p>}
  </div>
}
