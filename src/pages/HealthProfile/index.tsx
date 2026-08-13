import { Activity, AlertTriangle, Baby, CalendarDays, ChevronDown, ChevronRight, FileHeart, HeartPulse, Moon, Pill, Stethoscope, Syringe, UserRound, UsersRound, Utensils, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Typography } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { MemberIdentityCard } from '../../components/health'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { type HealthProfileSectionConfig } from '../../features/health-profile/config/healthProfileSections'
import { getHealthProfileType } from '../../features/health-profile/utils/getHealthProfileProfile'
import { getHealthProfileHomeGroups, getStoredHealthProfileSectionDetails } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { hasBasicHealthProfileValues } from '../../features/health-profile/utils/healthProfileBasicInfo'

const icons: Record<HealthProfileSectionConfig['icon'], LucideIcon> = {
  activity: Activity, allergy: AlertTriangle, baby: Baby, calendar: CalendarDays, care: UserRound,
  family: UsersRound, file: FileHeart, heart: HeartPulse, pill: Pill, sleep: Moon,
  stethoscope: Stethoscope, syringe: Syringe, utensils: Utensils,
}
const categoryLabels: Record<HealthProfileSectionConfig['category'], string> = {
  core: '核心健康背景', lifestyle: '生活方式', 'long-term': '其他长期健康背景', child: '儿童 / 成长', female: '女性相关', elder: '老年相关'
}

function getSectionSummary(section: HealthProfileSectionConfig, memberId: string) {
  try {
    const records = JSON.parse(localStorage.getItem(`hoho-health-profile:${memberId}:${section.id}`) ?? '[]') as Array<Record<string, unknown>>
    if (!records.length) return section.description
    const visible = section.fields.flatMap((field) => {
      const value = records[0]?.[field.id]
      if (value == null || value === '' || value === false) return []
      return [`${field.label}：${String(value)}`]
    }).slice(0, 2)
    return visible.join(' · ') || `已记录 ${records.length} 项`
  } catch { return section.description }
}

function ProfileSectionRows({ sections, memberId }: { sections: HealthProfileSectionConfig[]; memberId: string }) {
  const navigate = useNavigate()
  return (
    <div className="overflow-hidden rounded-card border bg-surface">
      {sections.map((section) => {
        const Icon = icons[section.icon]
        return (
          <button className="hoho-surface-row" key={section.id} onClick={() => navigate(`/health-profile/${section.id}`)} type="button">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={19} strokeWidth={1.75} /></span>
            <span className="min-w-0 flex-1 text-left">
              <Typography className="font-medium text-text-primary" variant="body">{section.title}</Typography>
              <Typography className="mt-0.5 block truncate" variant="caption">{getSectionSummary(section, memberId)}</Typography>
            </span>
            <ChevronRight className="shrink-0 text-text-secondary" size={18} />
          </button>
        )
      })}
    </div>
  )
}

export function HealthProfilePage() {
  const member = useCurrentMember()
  const [showAll, setShowAll] = useState(false)
  const profileType = getHealthProfileType(member.birthday, member.gender)
  const storedFromDevice = getStoredHealthProfileSectionDetails(member.id)
  const stored = hasBasicHealthProfileValues(member) && !storedFromDevice.some(({ id }) => id === 'basic')
    ? [...storedFromDevice, { id: 'basic' as const, updatedAt: '' }]
    : storedFromDevice
  const groups = useMemo(() => getHealthProfileHomeGroups(profileType, stored), [profileType, stored.map(({ id, updatedAt }) => `${id}:${updatedAt}`).join('|')])
  const catalog = groups.all.reduce<Array<[HealthProfileSectionConfig['category'], HealthProfileSectionConfig[]]>>((result, section) => {
    const current = result.find(([category]) => category === section.category)
    if (current) current[1].push(section)
    else result.push([section.category, [section]])
    return result
  }, [])

  return (
    <main className="app-shell">
      <MainAppHeader title="健康档案" />
      <div className="page-content pb-10">
        <MemberIdentityCard member={member} />

        {groups.recorded.length > 0 && <section className="grid gap-3">
          <header><Typography variant="sectionTitle">已记录</Typography><Typography className="mt-1" variant="caption">最近更新的健康档案优先显示</Typography></header>
          <ProfileSectionRows memberId={member.id} sections={groups.recorded} />
        </section>}

        <section className={`${groups.recorded.length ? 'mt-6' : ''} grid gap-3`}>
          <header><Typography variant="sectionTitle">可以补充</Typography><Typography className="mt-1" variant="caption">根据当前成员的年龄与资料推荐</Typography></header>
          <ProfileSectionRows memberId={member.id} sections={groups.suggested} />
        </section>

        <section className="mt-6 grid gap-3">
          <button className="flex min-h-12 items-center justify-between rounded-control border bg-surface px-4 text-left" onClick={() => setShowAll((current) => !current)} type="button" aria-expanded={showAll}>
            <span><Typography variant="sectionTitle">查看全部档案</Typography><Typography className="mt-0.5 block" variant="caption">完整的 26 项健康档案目录</Typography></span>
            <ChevronDown className={`text-text-secondary transition-transform ${showAll ? 'rotate-180' : ''}`} size={19} />
          </button>
          {showAll && <div className="grid gap-5">{catalog.map(([category, sections]) => <section className="grid gap-2" key={category}><Typography variant="label">{categoryLabels[category]}</Typography><ProfileSectionRows memberId={member.id} sections={sections} /></section>)}</div>}
        </section>
      </div>
    </main>
  )
}

export { HealthProfileSectionPage } from './HealthProfileSectionPage'
