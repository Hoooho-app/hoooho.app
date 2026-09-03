import type { Member } from '../../types'
import { RecordSubjectCard } from './RecordSubjectCard'

export function MemberIdentityCard({ member, recordSubject = false }: { member: Member; recordSubject?: boolean }) {
  const gender = member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : ''

  return <RecordSubjectCard age={member.age} avatar={member.avatar} gender={gender} label={recordSubject ? '记录对象' : '当前成员'} name={member.name} />
}
