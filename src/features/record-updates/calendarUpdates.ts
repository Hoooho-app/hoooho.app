import type {RecordUpdate} from './store'
import type {JournalEntry} from '../../pages/HealthEvents/timeViewModel'
import {getLocalDateKey} from '../../utils/localCalendarDate'
import {journalOccurrenceAt} from '../../../shared/journal-occurrence.mjs'

export function calendarUpdateDays(updates:readonly RecordUpdate[],entries:readonly JournalEntry[]){
  const records=new Map(entries.map(entry=>[entry.id,entry]))
  const days=new Map<string,string[]>()
  for(const update of updates){
    if(update.destination==='profile')continue
    const entry=records.get(update.recordId??'')
    // Legacy notices have no occurrence; resolve the record before falling back
    // to the day the notice arrived. Never move a known backfill to today.
    const at=entry&&entry.timePrecision!=='unknown'?journalOccurrenceAt(entry,entry.occurredAt):update.occurredAt??update.at
    const day=getLocalDateKey(new Date(at))
    if(day)days.set(day,[...(days.get(day)??[]),update.id])
  }
  return days
}
