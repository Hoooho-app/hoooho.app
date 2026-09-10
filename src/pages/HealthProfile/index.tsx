import { Activity, Check, ChevronRight, Circle, ClipboardPlus, Ear, Heart, HeartPulse, Hospital, LockKeyhole, Pill, Scissors, ShieldPlus, Syringe, UsersRound, X, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/common'
import { Typography } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { getCurrentPath, makeMemberProfileOpenState } from '../../components/navigation/navigationState'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { healthEventService } from '../../services/healthEvents'
import { useAppStore } from '../../store/useAppStore'
import type { HealthEventApiDto, Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { buildAllergyOverview, buildBasicOverview, formatGrowthCardUpdatedAt } from './healthProfileOverview'

const lockedSections: Array<{ title: string; icon: LucideIcon }> = [
  { title: '检查 / 体检报告', icon: ClipboardPlus }, { title: '心理与情绪健康', icon: Heart }, { title: '视力与听力', icon: Ear },
  { title: '口腔与牙齿', icon: Circle }, { title: '疫苗接种史', icon: Syringe }, { title: '长期用药', icon: Pill },
  { title: '慢性病史', icon: HeartPulse }, { title: '手术史', icon: Scissors }, { title: '住院 / 急诊史', icon: Hospital },
  { title: '输血史', icon: Activity }, { title: '家族遗传史', icon: UsersRound },
]
const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const

function exactCurrentMember(currentMemberId: string, members: Member[], profile: ReturnType<typeof useAppStore.getState>['profile']): Member {
  const member = members.find((item) => item.id === currentMemberId)
  if (member) return member
  if (currentMemberId === 'self' && profile) return { id: 'self', name: profile.nickname, age: formatAgeFromBirthday(profile.birthday), relation: '本人', birthday: profile.birthday, gender: profile.gender, avatar: profile.avatar }
  return { id: currentMemberId, name: '记录对象加载中', age: '', relation: '其他' }
}

function GrowthMetric({ label, unit, value }: { label: string; unit?: string; value: string }) {
  return <span><small>{label}</small><strong>{value || '待补充'}</strong>{value && unit && <small>{unit}</small>}</span>
}

export function HealthProfilePage() {
  const navigate = useNavigate(), location = useLocation()
  const token = useAppStore((state) => state.authToken), currentMemberId = useAppStore((state) => state.currentMemberId)
  const members = useAppStore((state) => state.members), profile = useAppStore((state) => state.profile)
  const member = exactCurrentMember(currentMemberId, members, profile)
  const [allergyEvents, setAllergyEvents] = useState<HealthEventApiDto[]>([]), [showSaved, setShowSaved] = useState(false)
  const stored = useMemo(() => getStoredHealthProfileSectionSnapshots(currentMemberId), [currentMemberId])
  const records = useMemo(() => new Map(stored.map((item) => [item.id, item.records])), [stored])
  const basic = useMemo(() => buildBasicOverview(member, records), [member, records])
  const allergy = useMemo(() => buildAllergyOverview(records.get('allergy'), allergyEvents, currentMemberId), [allergyEvents, currentMemberId, records])
  const age = member.birthday ? formatAgeFromBirthday(member.birthday) : member.age

  useEffect(() => {
    const state = location.state as Record<string, unknown> | null
    if (!state?.growthCardSaved) return
    setShowSaved(true)
    const { growthCardSaved: _saved, ...rest } = state
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: rest })
  }, [location.hash, location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    if (!showSaved) return
    const timer = window.setTimeout(() => setShowSaved(false), 3200)
    return () => window.clearTimeout(timer)
  }, [showSaved])

  useEffect(() => {
    if (!token || currentMemberId === 'self') { setAllergyEvents([]); return }
    const controller = new AbortController()
    healthEventService.list(token, controller.signal).then((events) => setAllergyEvents(events.filter((event) => event.memberId === currentMemberId && event.category === 'allergy'))).catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setAllergyEvents([]) })
    return () => controller.abort()
  }, [currentMemberId, token])

  const openMember = () => {
    const returnTo = getCurrentPath(location.pathname, location.search, location.hash)
    navigate(returnTo, { replace: true, state: makeMemberProfileOpenState(member.id, returnTo, location.state as Record<string, unknown> | null, window.scrollY) })
  }

  return <main className="app-shell health-profile-overview"><MainAppHeader title="健康档案" /><div className="page-content pb-10">
    <section className={`growth-identity-card ${basic.complete ? 'growth-identity-card--complete' : ''}`} aria-labelledby="growth-card-title">
      <button className="growth-identity-card__member" onClick={openMember} type="button"><Avatar name={member.name} size={basic.complete ? 'lg' : 'md'} src={member.avatar} /><span><strong id="growth-card-title">{member.name}</strong><small>{genderLabels[member.gender ?? '']} · {age}</small></span>{basic.complete && <em><Check size={13} />已建立</em>}<ChevronRight aria-hidden="true" size={18} /></button>
      {!basic.complete && <p>再补充 <strong>{basic.missingCount}</strong> 项，就能生成成长身份卡</p>}
      <div className="growth-identity-card__metrics"><GrowthMetric label="身高" unit="cm" value={basic.height} /><GrowthMetric label="体重" unit="kg" value={basic.weight} /><GrowthMetric label="血型" unit="血型" value={basic.bloodType ? `${basic.bloodType}型` : ''} /></div>
      <button className="growth-identity-card__action" onClick={() => navigate('/health-profile/basic')} type="button">{basic.complete ? '更新成长数据' : '生成成长身份卡'}<ChevronRight aria-hidden="true" size={18} /></button>
      {basic.complete && formatGrowthCardUpdatedAt(basic.updatedAt) && <small className="growth-identity-card__updated">{formatGrowthCardUpdatedAt(basic.updatedAt)}</small>}
    </section>

    <button className="health-profile-allergy-card" onClick={() => navigate('/health-profile/allergy')} type="button"><header><span className="health-profile-open-card__icon"><ShieldPlus aria-hidden="true" size={22} /></span><span><Typography variant="cardTitle">过敏与反应记录</Typography><Typography variant="caption">{allergy.total || allergy.latest ? '食物、环境、动物、药物及其他相关线索' : '暂无已知反应'}</Typography></span><ChevronRight aria-hidden="true" size={19} /></header>{allergy.total > 0 ? <div className="health-profile-allergy-stats"><span>正在排查<strong>{allergy.investigating}</strong></span><span>家长怀疑<strong>{allergy.suspected}</strong></span><span>医生已确认<strong>{allergy.doctorConfirmed}</strong></span></div> : <p>不确定过敏原也可以先记录症状</p>}{allergy.latest && <span className="health-profile-open-card__summary"><small>最近一次反应</small>{allergy.latest}</span>}<span className="health-profile-allergy-card__action">{allergy.total || allergy.latest ? '查看反应记录' : '记录第一次反应'}<ChevronRight aria-hidden="true" size={17} /></span></button>

    <section className="mt-6" aria-labelledby="more-health-profile-title"><header className="health-profile-locked-heading"><Typography id="more-health-profile-title" variant="sectionTitle">更多健康档案</Typography><Typography variant="caption">会员功能 · 暂未开放</Typography></header><div className="health-profile-locked-list" aria-label="暂未开放的会员健康档案">{lockedSections.map(({ title, icon: Icon }) => <div aria-disabled="true" className="health-profile-locked-row" key={title}><Icon aria-hidden="true" size={19} strokeWidth={1.7} /><span>{title}</span><small>暂未开放</small><LockKeyhole aria-hidden="true" size={16} /></div>)}</div></section>
  </div>{showSaved && <div className="growth-card-toast" role="status"><Check aria-hidden="true" size={17} /><span>成长身份卡已保存，并会用于就医准备</span><button aria-label="关闭提示" onClick={() => setShowSaved(false)} type="button"><X size={16} /></button></div>}</main>
}
