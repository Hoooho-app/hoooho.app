import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { HealthEventListItemViewModel } from '../../types'
import { formatHealthDate } from '../../utils/formatDate'
import { Card, Tag } from '../common'

export function HealthEventCard({ event }: { event: HealthEventListItemViewModel }) {
  const navigate = useNavigate()
  const statusLabel = event.status === 'observing' ? '观察中' : event.status === 'handling' ? '处理中' : '已恢复'
  const statusTone = event.status === 'observing' ? 'neutral' : event.status === 'handling' ? 'primary' : 'success'

  return (
    <button className="block w-full text-left" type="button" onClick={() => navigate(`/health-events/${event.id}`)}>
      <Card interactive className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold ${event.title ? '' : 'text-text-secondary'}`}>{event.title || '待补充健康情况'}</h3>
            <Tag tone={statusTone}>{statusLabel}</Tag>
          </div>
          <p className="text-xs text-text-secondary">{event.memberName} · 开始于 {formatHealthDate(event.startTime)}</p>
        </div>
        <ChevronRight className="text-text-secondary" size={18} />
      </Card>
    </button>
  )
}
