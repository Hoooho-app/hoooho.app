import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { HealthEventSubject } from '../../../services/healthEventPersonalization'
import { Avatar, Card } from '../../../components/common'

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
    <section className="space-y-3">
      <h2 className="section-title">记录对象</h2>
      <Card className="p-0">
        <button
          aria-expanded={isExpanded}
          className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left"
          onClick={() => setIsExpanded((current) => !current)}
          type="button"
        >
          <Avatar name={subject.name} size="sm" />
          <span className="min-w-0 flex-1">
            <strong className="block text-sm">{subject.name}</strong>
            <span className="mt-1 block truncate text-xs text-text-secondary">{subject.genderLabel} · {subject.displayAge}</span>
          </span>
          <ChevronDown className={`shrink-0 text-text-secondary transition-transform ${isExpanded ? '' : 'rotate-180'}`} size={19} />
        </button>

        {isExpanded && (
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t px-4 py-4">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-text-secondary">{label}</dt>
                <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </section>
  )
}
