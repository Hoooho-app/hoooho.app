import { Activity, Baby, ChevronRight, Circle, ClipboardPlus, Ear, Heart, HeartPulse, Hospital, LockKeyhole, Pill, Scissors, ShieldPlus, Syringe, UsersRound, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Typography } from '../../components/design-system'
import { RecordSubjectCard } from '../../components/health'
import { MainAppHeader } from '../../components/navigation'
import { getCurrentPath, makeMemberProfileOpenState } from '../../components/navigation/navigationState'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { healthEventService } from '../../services/healthEvents'
import { useAppStore } from '../../store/useAppStore'
import type { HealthEventApiDto, Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { buildAllergyOverview, buildBasicOverview } from './healthProfileOverview'

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

export function HealthProfilePage() {
  const navigate = useNavigate(), location = useLocation()
  const token = useAppStore((state) => state.authToken)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const members = useAppStore((state) => state.members)
  const profile = useAppStore((state) => state.profile)
  const member = exactCurrentMember(currentMemberId, members, profile)
  const [allergyEvents, setAllergyEvents] = useState<HealthEventApiDto[]>([])
  const stored = useMemo(() => getStoredHealthProfileSectionSnapshots(currentMemberId), [currentMemberId])
  const records = useMemo(() => new Map(stored.map((item) => [item.id, item.records])), [stored])
  const basic = useMemo(() => buildBasicOverview(member, records), [member, records])
  const allergy = useMemo(() => buildAllergyOverview(records.get('allergy'), allergyEvents, currentMemberId), [allergyEvents, currentMemberId, records])

  useEffect(() => {
    if (!token || currentMemberId === 'self') { setAllergyEvents([]); return }
    const controller = new AbortController()
    healthEventService.list(token, controller.signal).then((events) => setAllergyEvents(events.filter((event) => event.memberId === currentMemberId && event.category === 'allergy'))).catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setAllergyEvents([]) })
    return () => controller.abort()
  }, [currentMemberId, token])

  return <main className="app-shell health-profile-overview"><MainAppHeader title="健康档案" /><div className="page-content pb-10">
    <RecordSubjectCard action={<ChevronRight aria-hidden="true" className="text-text-secondary" size={19} />} age={member.birthday ? formatAgeFromBirthday(member.birthday) : member.age} avatar={member.avatar} gender={genderLabels[member.gender ?? '']} label="当前记录对象" name={member.name} onClick={() => { const returnTo = getCurrentPath(location.pathname, location.search, location.hash); navigate(returnTo, { replace: true, state: makeMemberProfileOpenState(member.id, returnTo, location.state as Record<string, unknown> | null, window.scrollY) }) }} />
    <section className="health-profile-open-list mt-5" aria-label="开放健康档案">
      <button className="health-profile-open-card" onClick={() => navigate('/health-profile/basic')} type="button"><span className="health-profile-open-card__icon"><Baby aria-hidden="true" size={22} /></span><span className="min-w-0 flex-1 text-left"><Typography variant="cardTitle">基础信息</Typography><Typography className="mt-1" variant="caption">出生情况、身高、体重、头围与成长变化</Typography></span><span className="health-profile-open-card__status">{basic.filled ? '已填写' : '未填写'}</span><ChevronRight aria-hidden="true" size={19} />{basic.summary && <span className="health-profile-open-card__summary">{basic.summary}</span>}</button>
      <button className="health-profile-open-card health-profile-open-card--allergy" onClick={() => navigate('/health-profile/allergy')} type="button"><span className="health-profile-open-card__icon"><ShieldPlus aria-hidden="true" size={22} /></span><span className="min-w-0 flex-1 text-left"><Typography variant="cardTitle">过敏与反应记录</Typography><Typography className="mt-1" variant="caption">食物、环境、动物、药物及其他相关线索</Typography></span><span className="health-profile-open-card__status">{allergy.total ? `共${allergy.total}项` : allergy.latest ? '已有记录' : '未填写'}</span><ChevronRight aria-hidden="true" size={19} />{allergy.total > 0 && <span className="health-profile-allergy-stats"><span>正在排查<strong>{allergy.investigating}</strong></span><span>家长怀疑<strong>{allergy.suspected}</strong></span><span>医生已确认<strong>{allergy.doctorConfirmed}</strong></span></span>}{allergy.latest && <span className="health-profile-open-card__summary"><small>最近一次反应</small>{allergy.latest}</span>}</button>
    </section>
    <section className="mt-7" aria-labelledby="more-health-profile-title"><header className="health-profile-locked-heading"><Typography id="more-health-profile-title" variant="sectionTitle">更多健康档案</Typography><Typography variant="caption">会员功能 · 暂未开放</Typography></header><div className="health-profile-locked-list" aria-label="暂未开放的会员健康档案">{lockedSections.map(({ title, icon: Icon }) => <div aria-disabled="true" className="health-profile-locked-row" key={title}><Icon aria-hidden="true" size={19} strokeWidth={1.7} /><span>{title}</span><small>暂未开放</small><LockKeyhole aria-hidden="true" size={16} /></div>)}</div></section>
  </div></main>
}
