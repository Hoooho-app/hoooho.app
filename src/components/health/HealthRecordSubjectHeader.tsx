import { Avatar } from '../common'
import { MedicalPrepButton } from '../design-system'
import type { Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import './HealthRecordSubjectHeader.css'

const genderLabels = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const

interface HealthRecordSubjectHeaderProps {
  member: Member | null
  onSummary: () => void
  summaryDisabled?: boolean
  className?: string
}

export function HealthRecordSubjectHeader({ member, onSummary, summaryDisabled = !member, className = '' }: HealthRecordSubjectHeaderProps) {
  const age = member?.birthday ? formatAgeFromBirthday(member.birthday) : member?.age
  const meta = member ? [genderLabels[member.gender ?? ''], age].filter(Boolean).join(' · ') : ''
  const rootClassName = ['health-record-subject-header', className].filter(Boolean).join(' ')

  return <div className={rootClassName} key={member?.id ?? 'empty'}>
    <div className="journal-subject-row">
      <div className="journal-subject-card" aria-label="记录对象">
        <Avatar name={member?.name ?? ' '} src={member?.avatar} size="sm" />
        <span className="journal-subject-copy">
          <span className="journal-subject-name"><strong>{member?.name ?? ' '}</strong></span>
          <span className="journal-subject-meta">{meta}</span>
        </span>
      </div>
      <MedicalPrepButton aria-label="就诊情况单，孩子情况快速整理" className="journal-subject-summary" label="就诊情况单" onClick={onSummary} disabled={summaryDisabled} />
    </div>
  </div>
}
