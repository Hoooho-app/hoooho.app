import { useEffect, useState } from 'react'
import { isChildProfileVitals } from '../../../shared/child-profile-policy.mjs'
import { Avatar } from '../../components/common'
import { HealthCard, HohoButton } from '../../components/design-system'
import { formatGrowthMeasurement, resolveCurrentGrowthSnapshot } from '../../features/health-profile/utils/resolveCurrentGrowthMeasurements'
import { growthMeasurementService } from '../../services/growthMeasurements'
import { subscribeProfileSectionInvalidation } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { useProfileArchive } from './useProfileArchive'

interface ProfileMetricProps {
  label: string
  value?: string | null
  unit?: string
  note?: string | null
  empty?: string
}

function ProfileMetric({ label, value, unit, note, empty = '未填写' }: ProfileMetricProps) {
  return <div>
    <dt>{label}</dt>
    <dd>
      {value ? <>{value}{unit && <span className="child-personal-card__unit">{unit}</span>}</> : <span className="child-personal-card__empty">{empty}</span>}
      {note && <small>{note}</small>}
    </dd>
  </div>
}

export function ChildPersonalInfoCard({ member, onSelectChild }: { member: Member; onSelectChild: () => void }) {
  const token = useAppStore(state => state.authToken)
  const identity = useProfileArchive(member.id, 'identity')
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
  const growthEmpty = status === 'loading' ? '读取中…' : status === 'error' ? '暂不可用' : '未填写'
  const vitalRead = identity.records[0]?.vitals
  const vitals = identity.loaded && !identity.error && isChildProfileVitals(vitalRead) ? vitalRead : null
  const vitalsEmpty = identity.error ? '暂不可用' : identity.loading ? '读取中…' : '未记录'
  const bloodPressure = vitals?.systolicMmHg != null ? `${vitals.systolicMmHg}/${vitals.diastolicMmHg}` : null
  const gender = member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : '性别未填写'
  const age = formatAgeFromBirthday(member.birthday ?? '')

  return <HealthCard className="child-personal-card" data-hoho-surface="light" role="region" aria-labelledby="child-personal-info-title">
    <div className="child-personal-card__heading">
      <h2 id="child-personal-info-title" className="hoho-text-section-title">孩子的个人信息</h2>
      <HohoButton variant="text" aria-label="切换记录对象" onClick={onSelectChild}>切换孩子</HohoButton>
    </div>
    <div className="child-personal-card__identity">
      <Avatar name={member.name} src={member.avatar} size="md" />
      <div>
        <p className="hoho-text-page-title">{member.name}</p>
        <p className="hoho-text-caption">{gender} · {age}</p>
      </div>
    </div>
    <dl className="child-personal-card__metrics" aria-label="身高、体重和血型">
      <ProfileMetric label="身高" value={status === 'ready' ? formatGrowthMeasurement(snapshot.heightCm) : null} unit="cm" note={status === 'ready' ? snapshot.heightMeasuredAt : null} empty={growthEmpty} />
      <ProfileMetric label="体重" value={status === 'ready' ? formatGrowthMeasurement(snapshot.weightKg) : null} unit="kg" note={status === 'ready' ? snapshot.weightMeasuredAt : null} empty={growthEmpty} />
      <ProfileMetric label="血型" value={member.bloodType ? `${member.bloodType}型` : null} note={member.rhBloodType ? `RhD ${member.rhBloodType === 'positive' ? '阳性' : '阴性'}` : null} />
    </dl>
    <dl className="child-personal-card__metrics child-personal-card__metrics--vitals" aria-label="血压和脉搏">
      <ProfileMetric label="血压" value={bloodPressure} unit="mmHg" empty={vitalsEmpty} />
      <ProfileMetric label="脉搏" value={vitals?.pulseBpm?.toString()} unit="次/分" empty={vitalsEmpty} />
    </dl>
    {status === 'error' && <p className="child-personal-card__error" role="alert">身高、体重读取失败<HohoButton variant="text" onClick={() => setRevision(value => value + 1)}>重试</HohoButton></p>}
    {identity.error && <p className="child-personal-card__error" role="alert">血压、脉搏读取失败<HohoButton variant="text" aria-label="重试读取血压和脉搏" onClick={identity.refresh}>重试</HohoButton></p>}
  </HealthCard>
}
