import { Activity, AlertTriangle, Baby, CalendarDays, ChevronRight, FileHeart, HeartPulse, Moon, Pill, Stethoscope, Syringe, UserRound, UsersRound, Utensils, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { HealthTag, Typography } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { MemberIdentityCard } from '../../components/health'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { healthProfiles } from '../../mock/healthProfiles'
import { type HealthProfileSectionConfig } from '../../features/health-profile/config/healthProfileSections'
import { getHealthProfileType } from '../../features/health-profile/utils/getHealthProfileProfile'
import { getHealthProfileSectionGroups, getStoredHealthProfileSections } from '../../features/health-profile/utils/getHealthProfileSectionGroups'

const icons: Record<HealthProfileSectionConfig['icon'], LucideIcon> = {
  activity: Activity, allergy: AlertTriangle, baby: Baby, calendar: CalendarDays, care: UserRound,
  family: UsersRound, file: FileHeart, heart: HeartPulse, pill: Pill, sleep: Moon,
  stethoscope: Stethoscope, syringe: Syringe, utensils: Utensils,
}

function getSectionCount(sectionId: string, memberId: string) {
  const profile = healthProfiles.find((item) => item.memberId === memberId)
  if (!profile) return 0
  if (sectionId === 'basic') return [profile.heightCm, profile.weightKg, profile.bloodType].filter(Boolean).length
  if (sectionId === 'allergy') return profile.allergies.length
  if (sectionId === 'medication') return profile.medications.length
  if (sectionId === 'history') return profile.medicalHistory.length
  if (sectionId === 'family-history') return profile.familyHistory.length
  return 0
}

function ProfileSectionRows({ sections, memberId, historical = false }: { sections: HealthProfileSectionConfig[]; memberId: string; historical?: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="overflow-hidden rounded-card border bg-surface">
      {sections.map((section) => {
        const Icon = icons[section.icon]
        const count = getSectionCount(section.id, memberId)
        return (
          <button className={`hoho-surface-row ${historical ? 'text-text-secondary' : ''}`} key={section.id} onClick={() => navigate(`/health-profile/${section.id}`)} type="button">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={19} strokeWidth={1.75} /></span>
            <span className="min-w-0 flex-1">
              <Typography className="font-medium text-text-primary" variant="body">{section.title}</Typography>
              <Typography className="mt-0.5 block truncate" variant="caption">{count ? `已记录 ${count} 项` : section.description}</Typography>
            </span>
            {historical && section.historicalLabel && <HealthTag>{section.historicalLabel}</HealthTag>}
            <ChevronRight className="shrink-0 text-text-secondary" size={18} />
          </button>
        )
      })}
    </div>
  )
}

export function HealthProfilePage() {
  const member = useCurrentMember()
  const profileType = getHealthProfileType(member.birthday, member.gender)
  const sectionsWithData = getStoredHealthProfileSections(member.id)
  const { priorities, secondary, historical } = getHealthProfileSectionGroups(profileType, sectionsWithData)

  return (
    <main className="app-shell">
      <MainAppHeader title="健康档案" />
      <div className="page-content pb-10">
        <MemberIdentityCard member={member} />
        <section className="grid gap-3">
          <header><Typography variant="sectionTitle">当前重点</Typography><Typography className="mt-1" variant="caption">根据当前成员的年龄与性别动态排序</Typography></header>
          <ProfileSectionRows memberId={member.id} sections={priorities} />
        </section>
        <section className="mt-6 grid gap-3">
          <header><Typography variant="sectionTitle">其他健康档案</Typography><Typography className="mt-1" variant="caption">当前仍适用的其他健康资料</Typography></header>
          <ProfileSectionRows memberId={member.id} sections={secondary} />
        </section>
        {historical.length > 0 && (
          <section className="mt-6 grid gap-3">
            <header><Typography variant="sectionTitle">历史档案</Typography><Typography className="mt-1" variant="caption">过去生命阶段留下的健康资料</Typography></header>
            <ProfileSectionRows historical memberId={member.id} sections={historical} />
          </section>
        )}
      </div>
    </main>
  )
}

export { HealthProfileSectionPage } from './HealthProfileSectionPage'
