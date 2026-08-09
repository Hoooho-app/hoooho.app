import { Heart } from 'lucide-react'
import type { HealthEvent } from '../../../types'
import { Card } from '../../../components/common'

export function ConcernSection({ event }: { event: HealthEvent }) {
  return (
    <section className="space-y-3">
      <h2 className="section-title">我的担心</h2>
      <Card>
        {!event.concerns.length ? (
          <div className="flex items-center gap-3 py-2 text-text-secondary">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"><Heart size={18} /></span>
            <div><h3 className="text-sm font-semibold text-text-primary">记录担心的问题</h3><p className="mt-1 text-xs">该记录入口准备中</p></div>
          </div>
        ) : (
          <ul className="space-y-3">
            {event.concerns.map((concern) => <li key={concern} className="flex gap-3 text-sm leading-6"><Heart className="mt-1 shrink-0 text-primary" size={16} /><span>{concern}</span></li>)}
          </ul>
        )}
      </Card>
    </section>
  )
}
