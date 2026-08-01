import { AlertTriangle, ChevronRight, FileHeart, HeartPulse, Pill, UsersRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, Header } from '../../components/common'
import { MemberIdentityCard } from '../../components/health'
import { BottomNavigation } from '../../components/navigation'
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
      <Header title="健康档案" />
      <div className="page-content">
        <MemberIdentityCard member={member} />
        <Card className="bg-primary-soft">
          <h2 className="font-semibold">健康信息</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">记录基础健康资料，帮助更好了解长期健康情况。</p>
        </Card>
        <section className="space-y-3">
          {categories.map(({ label, description, count, icon: Icon }) => (
            <button key={label} className="block w-full text-left">
              <Card interactive className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={20} strokeWidth={1.75} /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">{label}</strong>
                  <span className="mt-1 block truncate text-xs text-text-secondary">{description} · {count} 项</span>
                </span>
                <ChevronRight className="text-text-secondary" size={18} />
              </Card>
            </button>
          ))}
        </section>
      </div>
      <BottomNavigation />
    </main>
  )
}
