import type { Member } from '../../types'
import { Avatar, Card } from '../common'

export function MemberIdentityCard({ member }: { member: Member }) {
  return (
    <Card className="flex items-center gap-3 bg-primary-soft/60">
      <Avatar name={member.name} />
      <div>
        <strong className="block text-sm">{member.name}</strong>
        <span className="text-xs text-text-secondary">{member.age} · 当前健康数据归属于该成员</span>
      </div>
    </Card>
  )
}
