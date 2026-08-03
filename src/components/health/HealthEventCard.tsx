import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { HealthEvent } from '../../types'
import { formatHealthDate } from '../../utils/formatDate'
import { Card, Tag } from '../common'

export function HealthEventCard({ event }: { event: HealthEvent }) {
  const navigate = useNavigate()
  const statusLabel = event.status === 'empty' ? '待记录' : event.status === 'ongoing' ? '持续中' : '已恢复'
  const statusTone = event.status === 'empty' ? 'neutral' : event.status === 'ongoing' ? 'primary' : 'success'
  return (
    <button className="block w-full text-left" onClick={() => navigate(`/health-events/${event.id}`)}>
      <Card interactive className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{event.title}</h3>
            <Tag tone={statusTone}>{statusLabel}</Tag>
          </div>
          <p className="text-xs text-text-secondary">开始于 {formatHealthDate(event.startDate)}</p>
        </div>
        <ChevronRight className="text-text-secondary" size={18} />
      </Card>
    </button>
  )
}
