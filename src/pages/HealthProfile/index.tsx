import { ChevronRight, ClipboardPlus, HeartPulse, Hospital, LockKeyhole, Scissors, ShieldPlus, UsersRound, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Typography } from '../../components/design-system'
import { HealthRecordSubjectHeader } from '../../components/health'
import { MainAppHeader } from '../../components/navigation'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { healthEventService } from '../../services/healthEvents'
import { useAppStore } from '../../store/useAppStore'
import type { HealthEventApiDto, Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { buildAllergyOverview } from './healthProfileOverview'

const lockedSections: Array<{ title: string; icon: LucideIcon }> = [
  { title: '检查 / 体检报告', icon: ClipboardPlus }, { title: '慢性病史', icon: HeartPulse },
  { title: '手术史', icon: Scissors }, { title: '住院 / 急诊史', icon: Hospital },
  { title: '家族遗传史', icon: UsersRound },
]
function exactCurrentMember(currentMemberId: string, members: Member[], profile: ReturnType<typeof useAppStore.getState>['profile']): Member {
  const member = members.find((item) => item.id === currentMemberId)
  if (member) return member
  if (currentMemberId === 'self' && profile) return { id: 'self', name: profile.nickname, age: formatAgeFromBirthday(profile.birthday), relation: '本人', birthday: profile.birthday, gender: profile.gender, avatar: profile.avatar }
  return { id: currentMemberId, name: '记录对象加载中', age: '', relation: '其他' }
}

export function HealthProfilePage() {
  const navigate = useNavigate()
  const token = useAppStore((state) => state.authToken), currentMemberId = useAppStore((state) => state.currentMemberId)
  const members = useAppStore((state) => state.members), profile = useAppStore((state) => state.profile)
  const member = exactCurrentMember(currentMemberId, members, profile)
  const [allergyEvents, setAllergyEvents] = useState<HealthEventApiDto[]>([])
  const [allergyPromptIndex, setAllergyPromptIndex] = useState(0)
  const allergyPrompts = ['怀疑过的，也可以先记下来','记得孩子对什么不舒服吗？','检查阴性，也可以保留当时的怀疑','有过红疹、腹泻或喘咳，可以回想一下诱因','家里人说过的过敏，也值得先存下来','不用确定，先留下线索']
  const stored = useMemo(() => getStoredHealthProfileSectionSnapshots(currentMemberId), [currentMemberId])
  const records = useMemo(() => new Map(stored.map((item) => [item.id, item.records])), [stored])
  const allergy = useMemo(() => buildAllergyOverview(records.get('allergy'), allergyEvents, currentMemberId), [allergyEvents, currentMemberId, records])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setAllergyPromptIndex((value) => (value + 1) % allergyPrompts.length), 7000)
    return () => window.clearInterval(timer)
  }, [allergyPrompts.length])

  useEffect(() => {
    if (!token || currentMemberId === 'self') { setAllergyEvents([]); return }
    const controller = new AbortController()
    healthEventService.list(token, controller.signal).then((events) => setAllergyEvents(events.filter((event) => event.memberId === currentMemberId && event.category === 'allergy'))).catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setAllergyEvents([]) })
    return () => controller.abort()
  }, [currentMemberId, token])

  return <main className="app-shell health-profile-overview"><MainAppHeader title="健康档案" /><div className="page-content pb-10">
    <HealthRecordSubjectHeader className="health-profile-record-subject" member={member} onSummary={() => navigate('/visit-summary')} />

    <button className="health-profile-allergy-card" onClick={() => navigate('/health-profile/allergy')} type="button"><header><span className="health-profile-open-card__icon"><ShieldPlus aria-hidden="true" size={22} /></span><span><Typography variant="cardTitle">过敏史</Typography><Typography variant="caption">{allergy.total || allergy.latest ? '已明确对象与待排查线索' : '暂无过敏信息'}</Typography></span><ChevronRight aria-hidden="true" size={19} /></header>{allergy.total > 0 ? <div className="health-profile-allergy-stats"><span>待排查<strong>{allergy.investigating + allergy.suspected}</strong></span><span>已明确<strong>{allergy.doctorConfirmed}</strong></span></div> : <p className="health-profile-allergy-prompt" key={allergyPromptIndex}>{allergyPrompts[allergyPromptIndex]}</p>}{allergy.latest && <span className="health-profile-open-card__summary"><small>最近一次反应</small>{allergy.latest}</span>}<span className="health-profile-allergy-card__action">查看过敏史<ChevronRight aria-hidden="true" size={17} /></span></button>

    <section className="mt-6" aria-labelledby="more-health-profile-title"><header className="health-profile-locked-heading"><Typography id="more-health-profile-title" variant="sectionTitle">更多健康档案</Typography><Typography variant="caption">会员功能 · 暂未开放</Typography></header><div className="health-profile-locked-list" aria-label="暂未开放的会员健康档案">{lockedSections.map(({ title, icon: Icon }) => <div aria-disabled="true" className="health-profile-locked-row" key={title}><Icon aria-hidden="true" size={19} strokeWidth={1.7} /><span>{title}</span><small>暂未开放</small><LockKeyhole aria-hidden="true" size={16} /></div>)}</div></section>
  </div></main>
}
