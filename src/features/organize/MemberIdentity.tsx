import { HealthCard } from '../../components/design-system'
import { Avatar } from '../../components/common/Avatar'
import { createVirtualAvatarId } from '../../utils/virtualAvatar'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { createChildAvatarSelection, serializeChildAvatar } from '../../utils/childAvatar'
import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import './organize.css'

export interface IdentityMember { name: string; birthday?: string | null; gender?: string | null; bloodType?: string | null }
export function MemberIdentity({ member, avatar, asOf, height, weight, onHeight, onWeight }: { member: IdentityMember; avatar?: string | null; asOf: string; height?: number | null; weight?: number | null; onHeight?: () => void; onWeight?: () => void }) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(asOf) ? `${asOf}T12:00:00+08:00` : asOf)
  const birth = parsePlainDate(member.birthday ?? ''), today = getLocalDateKey(date, 'Asia/Shanghai') ?? ''
  const years = birth ? Number(today.slice(0, 4)) - birth.year - (today.slice(5) < (member.birthday ?? '').slice(5) ? 1 : 0) : null
  const fallbackAvatar = birth && (member.gender === 'male' || member.gender === 'female') ? years !== null && years <= 7 ? serializeChildAvatar(createChildAvatarSelection(member.birthday!, member.gender, date, 'Asia/Shanghai')) : createVirtualAvatarId(member.birthday!, member.gender, date) : undefined
  const gender = member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : ''
  const age = member.birthday ? formatAgeFromBirthday(member.birthday, date, 'Asia/Shanghai') : ''
  const blood = /^(AB|A|B|O)/i.exec(member.bloodType ?? '')?.[1].toUpperCase()
  const facts = [{ label: '出生日期', value: member.birthday }, { label: '身高', value: height ? `${height} cm` : '', action: onHeight }, { label: '体重', value: weight ? `${weight} kg` : '', action: onWeight }, { label: '血型', value: blood ? `${blood}型` : '' }].filter(f => f.value)
  return <HealthCard className="organize-member-identity"><div className="organize-member-heading"><Avatar name={member.name} src={avatar || fallbackAvatar} size="md" /><div><h2>{member.name}</h2>{(gender || age) && <p>{[gender, age].filter(Boolean).join(' · ')}</p>}</div></div>
    {facts.length > 0 && <dl className="organize-member-facts">{facts.map(f => <div key={f.label} data-birthday={f.label === '出生日期' || undefined}><dt>{f.label}</dt><dd aria-label={f.label === '血型' ? '血型' : undefined}>{f.action ? <button type="button" onClick={f.action} aria-label={`${f.label}测量来源`}>{f.value}</button> : f.value}</dd></div>)}</dl>}
  </HealthCard>
}
