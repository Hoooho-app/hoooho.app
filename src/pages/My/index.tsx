import { Bell, ChevronRight, FileHeart, LockKeyhole, Settings, UsersRound } from 'lucide-react'
import { Avatar, Card, Header, Tag } from '../../components/common'
import { BottomNavigation } from '../../components/navigation'
import { members } from '../../mock/members'
import { useAppStore } from '../../store/useAppStore'

export function MyPage() {
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const currentMember = members.find((member) => member.id === currentMemberId) ?? members[0]

  const settings = [
    { label: '家庭成员管理', icon: UsersRound },
    { label: '健康数据管理', icon: FileHeart },
    { label: '通知设置', icon: Bell },
    { label: '隐私设置', icon: LockKeyhole }
  ]

  return (
    <main className="app-shell">
      <Header title="我的" settings />
      <div className="page-content">
        <Card className="flex items-center gap-3 bg-primary-soft">
          <Avatar name={currentMember.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{currentMember.name}</h2>
            <p className="text-sm text-text-secondary">{currentMember.age} · {currentMember.relation}</p>
          </div>
          <Tag tone="primary">当前成员</Tag>
        </Card>

        <section className="space-y-3">
          <h2 className="section-title">家庭成员</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {members.map((member) => (
              <button key={member.id} onClick={() => setCurrentMemberId(member.id)} className={`min-w-24 rounded-card border bg-surface p-3 text-center shadow-card ${member.id === currentMemberId ? 'border-primary' : ''}`}>
                <Avatar name={member.name} />
                <strong className="mt-2 block text-sm">{member.name}</strong>
                <span className="text-xs text-text-secondary">{member.age}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2"><Settings className="text-primary" size={18} /><h2 className="section-title">设置</h2></div>
          <Card className="divide-y p-0">
            {settings.map(({ label, icon: Icon }) => (
              <button key={label} className="flex min-h-14 w-full items-center gap-3 px-4 text-left first:rounded-t-card last:rounded-b-card hover:bg-primary-soft">
                <Icon className="text-primary" size={18} strokeWidth={1.75} />
                <span className="flex-1 text-sm font-medium">{label}</span>
                <ChevronRight className="text-text-secondary" size={17} />
              </button>
            ))}
          </Card>
        </section>
      </div>
      <BottomNavigation />
    </main>
  )
}
