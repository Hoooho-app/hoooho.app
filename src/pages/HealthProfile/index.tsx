import { AlertTriangle, ChevronRight, FileHeart, HeartPulse, Pill, UsersRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '../../components/common'
import { HohoSection, Typography } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { MemberIdentityCard } from '../../components/health'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { healthProfiles } from '../../mock/healthProfiles'

interface Category {
  label: string
  description: string
  count: number
  icon: LucideIcon
}

export function HealthProfilePage() {
  const member = useCurrentMember()
  const profile = healthProfiles.find((item) => item.memberId === member.id)
  const categories: Category[] = [
    { label: '基础信息', description: '身高、体重、血型等基础资料', count: profile ? 3 : 0, icon: FileHeart },
    { label: '过敏史', description: '药物、食物和环境过敏记录', count: profile?.allergies.length ?? 0, icon: AlertTriangle },
    { label: '长期用药', description: '长期使用的药物记录', count: profile?.medications.length ?? 0, icon: Pill },
    { label: '既往病史', description: '过去的重要疾病记录', count: profile?.medicalHistory.length ?? 0, icon: HeartPulse },
    { label: '家族健康史', description: '家庭成员的重要健康信息', count: profile?.familyHistory.length ?? 0, icon: UsersRound }
  ]

  return (
    <main className="app-shell">
      <MainAppHeader title="健康档案" />
      <div className="page-content">
        <MemberIdentityCard member={member} />
        <HohoSection description="记录基础健康资料，帮助更好了解长期健康情况。" title="健康信息">
          <div className="h-px bg-border" />
        </HohoSection>
        <section className="overflow-hidden rounded-card border bg-surface">
          {categories.map(({ label, description, count, icon: Icon }) => (
            <button key={label} className="block w-full border-b text-left last:border-b-0">
              <div className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition hover:bg-surface-muted">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={20} strokeWidth={1.75} /></span>
                <span className="min-w-0 flex-1">
                  <Typography variant="body" className="font-medium text-text-primary">{label}</Typography>
                  <Typography variant="caption" className="mt-1 block truncate">{description} · {count} 项</Typography>
                </span>
                <ChevronRight className="text-text-secondary" size={18} />
              </div>
            </button>
          ))}
        </section>
      </div>
    </main>
  )
}
