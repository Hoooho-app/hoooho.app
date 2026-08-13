import type { Member } from '../../types'
import { Avatar, Card } from '../common'

export function MemberIdentityCard({ member, recordSubject = false }: { member: Member; recordSubject?: boolean }) {
  const gender = member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : ''
  const meta = [gender, member.age].filter(Boolean).join(' · ')

  return (
    <Card className="flex items-center gap-3" aria-label={recordSubject ? '记录对象' : undefined}>
      <Avatar name={member.name} src={member.avatar} size={recordSubject ? 'lg' : 'md'} />
      <div>
        {recordSubject && <span className="hoho-text-caption block">记录对象</span>}
        <strong className={`${recordSubject ? 'mt-0.5 text-base' : 'text-sm'} block`}>{member.name}</strong>
        <span className={`${recordSubject ? 'mt-0.5 text-sm' : 'text-xs'} block text-text-secondary`}>
          {recordSubject ? meta : `${member.age} · 当前健康数据归属于该成员`}
        </span>
      </div>
    </Card>
  )
}
