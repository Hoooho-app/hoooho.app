import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HealthEventListItemViewModel, HealthEventStage } from '../../types'
import { ConfirmDialog } from '../design-system'
import { HealthEventCardSurface } from './HealthEventCardSurface'

const actionWidth = 148

interface HealthEventCardProps {
  dateLabel: string
  event: HealthEventListItemViewModel
  onStatusChange?: (eventId: string, status: HealthEventStage) => Promise<void>
  onDelete?: (eventId: string) => Promise<void>
}

export function HealthEventCard({ dateLabel, event, onStatusChange, onDelete }: HealthEventCardProps) {
  const navigate = useNavigate()
  const startX = useRef(0)
  const startTranslate = useRef(0)
  const moved = useRef(false)
  const [translateX, setTranslateX] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isRecovered = event.status === 'recovered' || event.status === 'ended'

  const finishSwipe = () => {
    setTranslateX((current) => current < -actionWidth / 2 ? -actionWidth : 0)
  }

  const changeStatus = async () => {
    if (!onStatusChange || busy) return
    setBusy(true)
    try {
      await onStatusChange(event.id, isRecovered ? 'observing' : 'ended')
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
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[var(--hoho-radius-large)]" data-event-id={event.id}>
      <div className="absolute inset-y-0 right-0 flex w-[148px] overflow-hidden rounded-r-[var(--hoho-radius-large)] text-surface">
        <button
          aria-label={isRecovered ? '重新观察这条健康随记' : '结束这条健康追踪'}
          className="grid w-[74px] place-items-center bg-primary px-1 text-center text-xs font-medium disabled:opacity-70"
          disabled={busy}
          type="button"
          onClick={() => void changeStatus()}
        >
          <span className="grid gap-1.5 justify-items-center">
            {isRecovered ? <RotateCcw size={19} /> : <CheckCircle2 size={19} />}
            {isRecovered ? '重新观察' : '已结束'}
          </span>
        </button>
        <button
          aria-label="删除这条健康随记"
          className="grid w-[74px] place-items-center bg-danger px-1 text-center text-xs font-medium disabled:opacity-70"
          disabled={busy}
          type="button"
          onClick={() => setConfirmDelete(true)}
        >
          <span className="grid gap-1.5 justify-items-center"><Trash2 size={19} />删除</span>
        </button>
      </div>

      <button
        aria-label={`查看${dateLabel}的健康随记：${event.displayTitle}，${event.icon.label}${event.durationLabel ? `，${event.durationLabel}` : ''}${event.summaryFragments.length ? `，${event.summaryFragments.map(({ label }) => label).join('，')}` : ''}`}
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
        <HealthEventCardSurface
          className={isRecovered ? 'health-event-list-card health-event-list-card--recovered' : 'health-event-list-card'}
          dateLabel={dateLabel}
          ageAtOccurrenceLabel={event.ageAtOccurrenceLabel}
          displayTitle={event.displayTitle}
          durationLabel={event.durationLabel}
          icon={event.icon}
          interactive
          summaryFragments={event.summaryFragments.map(({ label }) => label)}
          showChevron
          status={event.status}
        />
      </button>
      <ConfirmDialog
        confirmLabel="确认删除"
        danger
        description={`“${event.displayTitle}”删除后无法恢复。`}
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void deleteEvent()}
        open={confirmDelete}
        title="删除这条健康随记？"
      />
    </div>
  )
}
