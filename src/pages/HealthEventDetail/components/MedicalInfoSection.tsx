import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, FileHeart, HeartPulse, Pill, Users } from 'lucide-react'
import type { HealthEvent } from '../../../types'
import { Card } from '../../../components/common'

export function MedicalInfoSection({ event }: { event: HealthEvent }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const rows = [
    { label: '过敏史', value: event.medicalInfo.allergies.join('、'), icon: AlertCircle },
    { label: '长期用药', value: event.medicalInfo.medications.join('、'), icon: Pill },
    { label: '既往病史', value: event.medicalInfo.medicalHistory.join('、'), icon: FileHeart },
    { label: '慢性疾病', value: event.medicalInfo.chronicDiseases.join('、'), icon: HeartPulse },
    { label: '家族健康史', value: event.medicalInfo.familyHistory.join('、'), icon: Users }
  ]

  return (
    <section className="space-y-3">
      <button
        aria-expanded={isExpanded}
        className="flex min-h-11 w-full items-center justify-between text-left"
        onClick={() => setIsExpanded((current) => !current)}
        type="button"
      >
        <span className="section-title">健康背景</span>
        <span className="flex items-center gap-1 text-xs text-text-secondary">
          {isExpanded ? '收起' : '展开'}
          <ChevronDown className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} size={18} />
        </span>
      </button>

      {isExpanded && (
        <Card className="divide-y p-0">
          {rows.map(({ label, value, icon: Icon }) => (
            <button key={label} className="flex min-h-16 w-full items-center gap-3 px-4 text-left" type="button">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-1 block truncate text-xs text-text-secondary">{value}</span>
              </span>
              <ChevronRight size={17} className="text-text-secondary" />
            </button>
          ))}
        </Card>
      )}

      {event.recoveryInfo && (
        <Card className="border-success/20 bg-success-soft">
          <h3 className="font-semibold text-success">恢复信息</h3>
          <p className="mt-2 text-sm leading-6">{event.recoveryInfo.note}</p>
        </Card>
      )}
    </section>
  )
}
