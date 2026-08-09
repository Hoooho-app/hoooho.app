import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { HealthEventListItemViewModel } from '../../types'
import { format } from 'date-fns'
import { parseISO } from 'date-fns'
import { Card, Tag } from '../common'

export function HealthEventCard({ event, compact = false }: { event: HealthEventListItemViewModel; compact?: boolean }) {
  const navigate = useNavigate()
  const statusLabel = event.status === 'observing' ? '观察中' : event.status === 'handling' ? '处理中' : '已恢复'
  const statusTone = event.status === 'observing' ? 'neutral' : event.status === 'handling' ? 'primary' : 'success'

  return (
    <button className="block w-full text-left" type="button" onClick={() => navigate(`/health-events/${event.id}`)}>
      <Card interactive className={`flex items-center gap-3 ${compact ? 'px-3 py-3' : ''}`}>
        {compact && <time className="self-start pt-0.5 text-xs font-medium text-text-secondary">{format(parseISO(event.startTime), 'HH:mm')}</time>}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold ${event.title ? '' : 'text-text-secondary'}`}>{event.title || '待补充健康情况'}</h3>
            <Tag tone={statusTone}>{statusLabel}</Tag>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-text-secondary">主要症状：{event.title || '待补充'}</p>
        </div>
        <ChevronRight className="text-text-secondary" size={18} />
      </Card>
    </button>
  )
}
