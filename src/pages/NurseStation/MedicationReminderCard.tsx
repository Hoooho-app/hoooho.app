import { Archive, MoreHorizontal, Pill, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { MedicationReminderDto } from '../../services/medicationReminders'
import { routeLabel } from './medicationReminderLogic'
import { formatReminderOccurrence, reminderActionState, reminderCoursePlanText, reminderCourseText, reminderProgressGroupLabel, weekRows } from './medicationCardLogic'
import type { VisitMedicationSnapshot } from '../../types/visitSheet'
import './medicationReadOnly.css'

// Both the interactive nurse card and the report use this same calendar and grouping.
export function MedicationCalendar({ reminder, now, readOnly = false, expanded = false, onEvidence }: {
  reminder: Pick<VisitMedicationSnapshot, 'plan' | 'totalDays' | 'occurrences'>; now: Date; readOnly?: boolean; expanded?: boolean; onEvidence?: (ids: string[]) => void
}) {
  const rows = useMemo(() => weekRows(reminder), [reminder])
  const weeks = rows.flat()
  const isFuture = (o: typeof reminder.occurrences[number]) => !o.completed && Date.parse(o.scheduledAt)>now.getTime()
  const dueWeek = [...weeks].reverse().find(w=>w.days.some(d=>d.occurrences.some(o=>!isFuture(o))))?.weekIndex
  const hiddenWeeks=weeks.filter(w=>w.weekIndex!==dueWeek||w.days.some(d=>d.occurrences.some(isFuture)))
  const renderWeek = (week: typeof weeks[number], phase:'all'|'due'|'future'='all') => {
    const included=(o:typeof reminder.occurrences[number])=>phase==='all'||(phase==='future'?isFuture(o):!isFuture(o))
    const days=phase==='all'?week.days:week.days.filter(d=>d.occurrences.some(included))
    return <section className="medication-course-card__week" key={`${week.weekIndex}-${phase}`}><span>{readOnly ? `第 ${week.weekIndex + 1} 周${phase==='future'?' · 未来计划':''}` : reminderProgressGroupLabel(reminder, now, week.weekIndex)}</span><div className="medication-course-card__days" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map(day=><div className="medication-course-card__day" key={day.day}>{Array.from({length:week.rows},(_,slot)=>{const o=day.occurrences[slot];if(!o||!included(o))return <i aria-hidden="true" className="is-empty" key={slot}/>;const future=isFuture(o),label=`${day.day} 第 ${slot+1} 次：${o.completed?'已确认使用':future?'未来计划':'未确认'}`,cls=o.completed?'is-completed':future?'is-future':'is-unconfirmed';return readOnly?<span key={o.id}>{onEvidence&&o.sourceId?<button className={cls} aria-label={label} onClick={()=>onEvidence([o.sourceId!])}>{o.completed?'✓':future?'·':'?'}</button>:<a className={cls} aria-label={label} href={o.sourceId?`#${o.sourceId}`:undefined}>{o.completed?'✓':future?'·':'?'}</a>}</span>:<i key={o.id} aria-label={`${day.day}第${slot+1}次${o.completed?'已记录':'未记录'}`} className={o.completed?'is-completed':''}/>})}{readOnly&&<small>{day.day.slice(5)}</small>}</div>)}
    </div></section>
  }
  return <div aria-label={`${reminder.plan.medicationName}疗程进度`} className="medication-course-card__week-rows">{readOnly?<>{weeks.filter(w=>expanded||w.weekIndex===dueWeek).map(w=>renderWeek(w,expanded?'all':'due'))}{!expanded&&hiddenWeeks.length>0&&<details className="visit-med-weeks"><summary>展开其他周与未来计划 · {hiddenWeeks.length} 周</summary>{hiddenWeeks.map(w=>renderWeek(w,w.weekIndex===dueWeek?'future':'all'))}</details>}</>:rows.map((row,i)=><div className="medication-course-card__week-row" key={i} style={{gridTemplateColumns:`repeat(${row.length}, minmax(0, 1fr))`}}>{row.map(w=>renderWeek(w))}</div>)}</div>
}

export function ReadOnlyMedicationReminderCard({ reminder, now, expanded=false, onEvidence }: {reminder:VisitMedicationSnapshot;now:Date;expanded?:boolean;onEvidence?:(ids:string[])=>void}) {
  const confirmed=reminder.occurrences.filter(o=>o.completed).length,unconfirmed=reminder.occurrences.filter(o=>!o.completed&&Date.parse(o.scheduledAt)<=now.getTime()).length,future=reminder.occurrences.filter(o=>!o.completed&&Date.parse(o.scheduledAt)>now.getTime()).length
  return <article className="medication-course-card medication-course-card--readonly" data-readonly-reminder={reminder.id}><div className="medication-course-card__surface"><div className="medication-course-card__summary"><h3><Pill aria-hidden="true"/>{reminder.plan.medicationName}</h3><p>{reminderCoursePlanText(reminder)} · {reminder.plan.startDate} — {reminder.plan.endDate||'未设结束日期'}</p><p>{reminder.plan.amount!=null?`每次 ${reminder.plan.amount} ${reminder.plan.unit||''}`:'剂量未记录'} · {reminder.plan.route?routeLabel(reminder.plan.route):'途径未记录'}</p><p>{reminder.status==='archived'?'提醒已归档':reminder.status==='active'?'提醒计划':'提醒状态未提供'} · 截至本报告生成时</p></div><div className="medication-course-card__course"><MedicationCalendar reminder={reminder} now={now} readOnly expanded={expanded} onEvidence={onEvidence}/><p className="visit-med-legend">✓ {confirmed} 次已确认使用 · ? {unconfirmed} 次未确认 · · {future} 次未来计划</p></div>{onEvidence?<button className="visit-text-action" onClick={()=>onEvidence(reminder.sourceIds)}>查看提醒计划依据</button>:reminder.sourceIds.map(id=><a key={id} href={`#${id}`}>查看提醒计划依据</a>)}</div></article>
}

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
  const managementRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(0)
  const [managementOpen, setManagementOpen] = useState(false)
  const activeCompletions = reminder.completions.filter((item) => !item.undoneAt)
  const { allComplete, due, next, historical, future, todayCompleted, todayScheduledCompleted, todayDone, todayTotal, takeLabel } = reminderActionState(reminder, now)
  const archived = reminder.status === 'archived'
  const courseEnded = reminderCourseText(reminder, now).includes('疗程已结束')
  const actionOffset = archived ? 72 : 144

  useEffect(() => {
    if (!managementOpen) return
    const close = (event: PointerEvent) => { if (!managementRef.current?.contains(event.target as Node)) setManagementOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [managementOpen])

  const runManagementAction = (action: () => void) => { setManagementOpen(false); action() }

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
          <p>疗程：{reminderCoursePlanText(reminder)}{courseEnded && ' · 疗程已结束'}</p>
          <p>用法：每次{reminder.plan.amount}{reminder.plan.unit}（{routeLabel(reminder.plan.route)}）</p>
          <p className="medication-course-card__today">今日计划：{todayTotal === 0 ? '无计划' : <><strong className={todayScheduledCompleted > 0 ? 'has-completed' : ''}>{todayScheduledCompleted}</strong><span>/{todayTotal}</span></>}</p>
          {todayCompleted !== todayScheduledCompleted && <p className="medication-course-card__today">按实际服用时间：今日 {todayCompleted} 次</p>}
          {historical && !archived && <p className="medication-course-card__pending">待确认计划：{next && formatReminderOccurrence(next, reminder.plan.timezone, now)} · 不代表未服用</p>}
          <p className="medication-course-card__next">下次：{archived ? '计划已停止' : allComplete ? '疗程已完成' : future ? formatReminderOccurrence(future, reminder.plan.timezone, now) : '无未来计划'}</p>
          {historical && !archived && <p>点击“记录服用”仍按当前服用时间记录，不自动补为过去已服用。</p>}
        </div>
        <div className="medication-course-card__controls">
          <div className="task-management" ref={managementRef}><button aria-expanded={managementOpen} className="task-management__trigger" onClick={() => setManagementOpen((value) => !value)} type="button">管理<MoreHorizontal aria-hidden="true" /></button>{managementOpen && <div className="task-management__menu" role="menu">{!archived && <button disabled={busy} onClick={() => runManagementAction(onArchive)} role="menuitem" type="button"><Archive aria-hidden="true" />归档</button>}<button className="is-danger" disabled={busy} onClick={() => runManagementAction(onDelete)} role="menuitem" type="button"><Trash2 aria-hidden="true" />删除提醒</button></div>}</div>
          {archived ? <span className="medication-course-card__archived">已归档</span> : <><button className="medication-course-card__take" disabled={busy || !due || allComplete || todayDone} onClick={onTake} type="button">{busy ? '处理中…' : takeLabel}</button><button className="medication-course-card__undo" disabled={busy || activeCompletions.length === 0} onClick={onUndo} type="button"><RotateCcw />撤回</button></>}
        </div>
      </div>
      <div className="medication-course-card__course">
        <MedicationCalendar reminder={reminder} now={now}/>
      </div>
    </div>
  </article>
}
