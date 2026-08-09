import { CheckCircle2, ChevronRight, RotateCcw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HealthEventListItemViewModel, HealthEventStage } from '../../types'
import { Card, Tag } from '../common'

const actionWidth = 148

interface HealthEventCardProps {
  event: HealthEventListItemViewModel
  onStatusChange?: (eventId: string, status: HealthEventStage) => Promise<void>
  onDelete?: (eventId: string) => Promise<void>
}

export function HealthEventCard({ event, onStatusChange, onDelete }: HealthEventCardProps) {
  const navigate = useNavigate()
  const startX = useRef(0)
  const startTranslate = useRef(0)
  const moved = useRef(false)
  const [translateX, setTranslateX] = useState(0)
  const [busy, setBusy] = useState(false)
  const isRecovered = event.status === 'recovered'
  const statusLabel = isRecovered ? '已康复' : '观察中'
  const statusTone = isRecovered ? 'success' : 'neutral'

  const finishSwipe = () => {
    setTranslateX((current) => current < -actionWidth / 2 ? -actionWidth : 0)
  }

  const changeStatus = async () => {
    if (!onStatusChange || busy) return
    setBusy(true)
    try {
      await onStatusChange(event.id, isRecovered ? 'observing' : 'recovered')
      setTranslateX(0)
    } finally {
      setBusy(false)
    }
  }

  const deleteEvent = async () => {
    if (!onDelete || busy) return
    setBusy(true)
    try {
      await onDelete(event.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-card" data-event-id={event.id}>
      <div className="absolute inset-y-0 right-0 flex w-[148px] overflow-hidden rounded-r-card text-surface">
        <button
          aria-label={isRecovered ? '重新观察该健康事件' : '标记该健康事件为已康复'}
          className="grid w-[74px] place-items-center bg-primary px-1 text-center text-xs font-medium disabled:opacity-70"
          disabled={busy}
          type="button"
          onClick={() => void changeStatus()}
        >
          <span className="grid gap-1.5 justify-items-center">
            {isRecovered ? <RotateCcw size={19} /> : <CheckCircle2 size={19} />}
            {isRecovered ? '重新观察' : '已康复'}
          </span>
        </button>
        <button
          aria-label="删除该健康事件"
          className="grid w-[74px] place-items-center bg-danger px-1 text-center text-xs font-medium disabled:opacity-70"
          disabled={busy}
          type="button"
          onClick={() => void deleteEvent()}
        >
          <span className="grid gap-1.5 justify-items-center"><Trash2 size={19} />删除</span>
        </button>
      </div>

      <button
        aria-label={`查看健康事件：${event.title || '待补充健康情况'}`}
        className="relative block w-full touch-pan-y text-left transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${translateX}px)` }}
        type="button"
        onClick={() => {
          if (moved.current) {
            moved.current = false
            return
          }
          if (translateX !== 0) {
            setTranslateX(0)
            return
          }
          navigate(`/health-events/${event.id}`)
        }}
        onPointerDown={(pointerEvent) => {
          startX.current = pointerEvent.clientX
          startTranslate.current = translateX
          moved.current = false
          pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId)
        }}
        onPointerMove={(pointerEvent) => {
          if (!pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) return
          const delta = pointerEvent.clientX - startX.current
          if (Math.abs(delta) > 6) moved.current = true
          setTranslateX(Math.max(-actionWidth, Math.min(0, startTranslate.current + delta)))
        }}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
      >
        <Card interactive className="flex items-center gap-3 px-3 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className={`truncate text-sm font-semibold ${event.title ? '' : 'text-text-secondary'}`}>{event.title || '待补充健康情况'}</h3>
              <Tag tone={statusTone}>{statusLabel}</Tag>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-text-secondary">主要症状：{event.title || '待补充'}</p>
          </div>
          <ChevronRight className="shrink-0 text-text-secondary" size={18} />
        </Card>
      </button>
    </div>
  )
}
