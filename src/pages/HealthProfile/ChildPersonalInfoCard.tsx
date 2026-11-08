import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/common'
import { HealthCard, HohoButton } from '../../components/design-system'
import { Pencil } from '../../components/icons'
import { formatGrowthMeasurement, resolveCurrentGrowthMeasurements } from '../../features/health-profile/utils/resolveCurrentGrowthMeasurements'
import { calculateBmi } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { familyMemberService } from '../../services/familyMembers'
import { growthMeasurementService } from '../../services/growthMeasurements'
import { subscribeProfileSectionInvalidation } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'

interface GrowthMetricProps {
  measure: 'height' | 'weight'
  value: number | null
  empty: string
}

function GrowthMetric({ measure, value, empty }: GrowthMetricProps) {
  const label = measure === 'height' ? '身高' : '体重'
  return <Link className="child-personal-card__metric" to="/health-profile/basic" state={{ selectedMeasure: measure, returnTo: '/health-profile' }}>
    <span className="child-personal-card__label">{label}</span>
    <span className="child-personal-card__value">
      {value == null ? <span className="child-personal-card__empty">{empty}</span> : <>{formatGrowthMeasurement(value)}<span className="child-personal-card__unit">{measure === 'height' ? 'cm' : 'kg'}</span></>}
    </span>
    <span className="sr-only">查看{label}曲线</span>
  </Link>
}

const bloodTypes = ['A', 'B', 'O', 'AB'] as const
type BloodTypeChoice = NonNullable<Member['bloodType']> | ''

export function ChildPersonalInfoCard({ member }: { member: Member }) {
  const token = useAppStore(state => state.authToken)
  const [measurements, setMeasurements] = useState<GrowthMeasurementApiDto[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [bloodSave, setBloodSave] = useState<{ choice: BloodTypeChoice; error?: string } | null>(null)
  const bloodSaveLocked = useRef(false)
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

  async function saveBloodType(choice: BloodTypeChoice) {
    const { authToken, authUser, currentMemberId } = useAppStore.getState()
    if (!authToken || !authUser || currentMemberId !== member.id || bloodSaveLocked.current) return
    if (choice === (member.bloodType ?? '')) { setBloodSave(null); return }

    bloodSaveLocked.current = true
    setBloodSave({ choice })
    try {
      const saved = await familyMemberService.update(member.id, { bloodType: choice || null }, authToken)
      const store = useAppStore.getState()
      if (store.authUser?.id === authUser.id && saved.accountId === authUser.id) {
        store.setMembers(store.members.map(item => item.id === member.id ? { ...item, bloodType: saved.bloodType ?? undefined } : item))
      }
      setBloodSave(null)
    } catch (error) {
      setBloodSave({ choice, error: error instanceof Error ? error.message : '请检查网络后重试' })
    } finally {
      bloodSaveLocked.current = false
    }
  }

  const growth = status === 'ready' ? resolveCurrentGrowthMeasurements(member, measurements, member.id) : null
  const bmi = growth ? calculateBmi(growth.heightCm, growth.weightKg) : null
  const growthEmpty = status === 'loading' ? '读取中…' : status === 'error' ? '暂不可用' : '未填写'
  const savingBloodType = bloodSave !== null && !bloodSave.error
  const gender = member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : '性别未填写'
  const age = formatAgeFromBirthday(member.birthday ?? '')

  return <HealthCard className="child-personal-card" data-hoho-surface="light" role="region" aria-labelledby="health-profile-subject-name">
    <div className="child-personal-card__identity">
      <Avatar name={member.name} src={member.avatar} size="md" />
      <div>
        <p id="health-profile-subject-name" className="hoho-text-page-title">{member.name}</p>
        <p className="hoho-text-caption">{gender} · {age}</p>
      </div>
      {bmi && <dl className="child-personal-card__bmi">
        <dt className="child-personal-card__label">BMI</dt>
        <dd className="child-personal-card__value">{bmi}</dd>
      </dl>}
    </div>
    <div className="child-personal-card__metrics" role="group" aria-label="身高、体重和血型">
      <GrowthMetric measure="height" value={growth?.heightCm ?? null} empty={growthEmpty} />
      <GrowthMetric measure="weight" value={growth?.weightKg ?? null} empty={growthEmpty} />
      <label className="child-personal-card__metric">
        <span className="child-personal-card__label">血型</span>
        <span className="child-personal-card__value" aria-live="polite">
          {savingBloodType || !member.bloodType ? <span className="child-personal-card__empty">{savingBloodType ? '保存中…' : '未填写'}</span> : `${member.bloodType}型`}
          <Pencil aria-hidden="true" size={14} />
        </span>
        {member.rhBloodType && <small>RhD {member.rhBloodType === 'positive' ? '阳性' : '阴性'}</small>}
        <select className="child-personal-card__blood-select" aria-label="血型" disabled={savingBloodType || !token} value={member.bloodType ?? ''} onChange={event => void saveBloodType(event.currentTarget.value as BloodTypeChoice)}>
          <option value="">未填写</option>
          {bloodTypes.map(bloodType => <option key={bloodType} value={bloodType}>{bloodType}型</option>)}
        </select>
      </label>
    </div>
    {status === 'error' && <p className="child-personal-card__error" role="alert">身高、体重读取失败<HohoButton variant="text" onClick={() => setRevision(value => value + 1)}>重试</HohoButton></p>}
    {bloodSave?.error && <p className="child-personal-card__error" role="alert">血型未保存，{bloodSave.error}<HohoButton variant="text" aria-label="重试保存血型" onClick={() => void saveBloodType(bloodSave.choice)}>重试</HohoButton></p>}
  </HealthCard>
}
