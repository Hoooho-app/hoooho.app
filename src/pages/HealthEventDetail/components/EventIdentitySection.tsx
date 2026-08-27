import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { HealthEventSubject } from '../../../services/healthEventPersonalization'
import { RecordSubjectCard } from '../../../components/health'

export function EventIdentitySection({ subject }: { subject: HealthEventSubject }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const details = [
    ['姓名', subject.name],
    ['性别', subject.genderLabel],
    ['出生日期', subject.birthday || '未填写'],
    ['身高', subject.healthProfile?.heightCm ? `${subject.healthProfile.heightCm} cm` : '未填写'],
    ['体重', subject.healthProfile?.weightKg ? `${subject.healthProfile.weightKg} kg` : '未填写'],
    ['血型', subject.healthProfile?.bloodType || '未填写'],
    ['MBTI', subject.healthProfile?.mbti || '未填写']
  ]

  return (
    <section>
      <div className="overflow-hidden rounded-2xl border border-primary/10 bg-surface/55">
        <RecordSubjectCard
          action={<ChevronDown className={`text-text-secondary transition-transform ${isExpanded ? '' : 'rotate-180'}`} size={19} />}
          age={subject.displayAge}
          avatar={subject.avatar}
          className="border-0 shadow-none"
          expanded={isExpanded}
          gender={subject.genderLabel}
          name={subject.name}
          onClick={() => setIsExpanded((current) => !current)}
        />

        {isExpanded && (
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-primary/10 px-4 py-4">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-text-secondary">{label}</dt>
                <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}
