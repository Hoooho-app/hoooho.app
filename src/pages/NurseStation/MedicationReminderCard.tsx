import { Archive, Pill, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { MedicationReminderDto } from '../../services/medicationReminders'
import { routeLabel } from './medicationReminderLogic'
import { formatReminderOccurrence, reminderActionState, reminderCoursePlanText, reminderCourseText, reminderProgressGroupLabel, weekRows } from './medicationCardLogic'

export function MedicationReminderCard({ reminder, now, open, busy, onOpen, onTake, onUndo, onArchive, onDelete }: {
  reminder: MedicationReminderDto
  now: Date
  open: boolean
  busy: boolean
  onOpen: (open: boolean) => void
  onTake: () => void
  onUndo: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const start = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const [drag, setDrag] = useState(0)
  const activeCompletions = reminder.completions.filter((item) => !item.undoneAt)
  const { allComplete, due, next, todayCompleted, todayDone, todayTotal, takeLabel } = reminderActionState(reminder, now)
  const archived = reminder.status === 'archived'
  const actionOffset = archived ? 72 : 144
  const rows = useMemo(() => weekRows(reminder), [reminder])

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    start.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.pointerId !== event.pointerId) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { start.current = null; setDrag(0); return }
    if (Math.abs(dx) > 8) { event.preventDefault(); setDrag(Math.max(-actionOffset, Math.min(0, (open ? -actionOffset : 0) + dx))) }
  }
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.pointerId !== event.pointerId) return
    const dx = event.clientX - start.current.x
    if (dx < -42) onOpen(true)
    else if (dx > 34) onOpen(false)
    setDrag(0); start.current = null
  }

  return <article className={`medication-course-card${open ? ' is-open' : ''}${archived ? ' is-archived' : ''}`} data-reminder-id={reminder.id}>
    <div aria-hidden={!open} className="medication-course-card__swipe-actions" onPointerDown={(event) => event.stopPropagation()} style={{ gridTemplateColumns: `repeat(${archived ? 1 : 2}, minmax(0, 1fr))`, width: actionOffset }}>
      {!archived && <button disabled={busy} onClick={onArchive} type="button"><Archive />归档</button>}
      <button disabled={busy} onClick={onDelete} type="button"><Trash2 />删除提醒</button>
    </div>
    <div className="medication-course-card__surface" onPointerCancel={() => { start.current = null; setDrag(0) }} onPointerDown={down} onPointerMove={move} onPointerUp={up} style={{ transform: `translateX(${drag || (open ? -actionOffset : 0)}px)` }}>
      <div className="medication-course-card__top">
        <div className="medication-course-card__summary">
          <h3><span><Pill /></span>{reminder.plan.medicationName}</h3>
          <p>疗程：{reminderCoursePlanText(reminder)}</p>
          <p>用法：每次{reminder.plan.amount}{reminder.plan.unit}（{routeLabel(reminder.plan.route)}）</p>
          <p className="medication-course-card__today">今日：<strong className={todayCompleted > 0 ? 'has-completed' : ''}>{todayCompleted}</strong><span>/{todayTotal}</span></p>
          <p className="medication-course-card__next">下次：{archived ? '计划已停止' : allComplete ? '疗程已完成' : next ? formatReminderOccurrence(next, reminder.plan.timezone, now) : '暂无'}</p>
        </div>
        <div className="medication-course-card__controls">
          {archived ? <span className="medication-course-card__archived">已归档</span> : <><button className="medication-course-card__take" disabled={busy || !due || allComplete || todayDone} onClick={onTake} type="button">{busy ? '处理中…' : takeLabel}</button><button className="medication-course-card__undo" disabled={busy || activeCompletions.length === 0} onClick={onUndo} type="button"><RotateCcw />撤回</button></>}
        </div>
      </div>
      <div className="medication-course-card__course">
        <p>{reminderCourseText(reminder, now)}</p>
        <div aria-label={`${reminder.plan.medicationName}疗程进度`} className="medication-course-card__week-rows">
          {rows.map((weeks, rowIndex) => <div className="medication-course-card__week-row" key={rowIndex} style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((week) => <section className="medication-course-card__week" key={week.weekIndex}><span>{reminderProgressGroupLabel(reminder, now, week.weekIndex)}</span><div className="medication-course-card__days" style={{ gridTemplateColumns: `repeat(${week.days.length}, minmax(0, 1fr))` }}>
              {week.days.map((day) => <div className="medication-course-card__day" key={day.day}>{Array.from({ length: week.rows }, (_, slot) => { const occurrence = day.occurrences[slot]; return occurrence ? <i aria-label={`${day.day}第${slot + 1}次${occurrence.completed ? '已记录' : '未记录'}`} className={occurrence.completed ? 'is-completed' : ''} key={occurrence.id} /> : <i aria-hidden="true" className="is-empty" key={`${day.day}-${slot}`} /> })}</div>)}
            </div></section>)}
          </div>)}
        </div>
      </div>
      <div className="medication-course-card__desktop-actions">{!archived && <button disabled={busy} onClick={onArchive} type="button"><Archive />归档</button>}<button disabled={busy} onClick={onDelete} type="button"><Trash2 />删除提醒</button></div>
    </div>
  </article>
}
