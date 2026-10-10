import { Fragment, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { HealthTag } from '../../components/design-system'
import { formatPlainMonthDay, getLocalDateKey } from '../../utils/localCalendarDate'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { journalCategoryLabels, journalSearchResultSummary, journalTime, type JournalEntry } from './timeViewModel'
import './JournalSearchPage.css'

function HighlightedText({ text, query }: { text: string; query: string }) {
  const characters = [...query.trim().replace(/\s+/g, '')]
  if (!characters.length) return text
  const pattern = characters.map(character => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')
  return <>{text.split(new RegExp(`(${pattern})`, 'giu')).map((part, index) => part && (new RegExp(`^${pattern}$`, 'iu').test(part) ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>))}</>
}

function resultDateLabel(day: string, today: string) {
  const yesterdayDate = new Date(`${today}T12:00:00`)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = getLocalDateKey(yesterdayDate)
  return day === today ? `今天 · ${formatPlainMonthDay(day)}` : day === yesterday ? `昨天 · ${formatPlainMonthDay(day)}` : formatPlainMonthDay(day)
}

export function JournalSearchResults({ entries, query, today, onOpen, summaryFor, layout = 'compact' }: {
  entries: readonly JournalEntry[]
  query: string
  today: string
  onOpen: (entry: JournalEntry) => void
  layout?: 'compact' | 'stacked'
  summaryFor?: (entry: JournalEntry) => string
}) {
  const groups = useMemo(() => {
    const days = new Map<string, JournalEntry[]>()
    for (const entry of entries) {
      const day = entry.timePrecision === 'unknown' ? 'unknown' : getLocalDateKey(entry.occurredAt) ?? 'unknown'
      if (!days.has(day)) days.set(day, [])
      days.get(day)!.push(entry)
    }
    return [...days].map(([day, items]) => ({ day, items }))
  }, [entries])
  return <div className="journal-search-results">{groups.map(group => <section className="journal-search-date-group" key={group.day}>
    <h2>{group.day === 'unknown' ? '时间未明确' : resultDateLabel(group.day, today)}</h2>
    <div>{group.items.map(entry => {
      const summary = summaryFor?.(entry) ?? journalSearchResultSummary(entry, query)
      return <button className="journal-search-result" key={entry.id} onClick={() => onOpen(entry)} type="button" aria-label={`${journalTime(entry).label} ${journalCategoryLabels[entry.categories?.[0] ?? 'other']} ${summary}，查看原话和附件`}>
        {layout === 'stacked' ? <>
          <span className="journal-search-result-meta"><time>{journalTime(entry).label}</time><JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} dietKind={entry.diet?.kind} /><HealthTag>{journalCategoryLabels[entry.categories?.[0] ?? 'other']}</HealthTag></span>
          <span className="journal-search-result-text"><HighlightedText query={query} text={summary} /></span>
          <span className="journal-search-result-hint">查看原话和附件</span>
        </> : <>
        <time>{journalTime(entry).label}</time>
        <JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} dietKind={entry.diet?.kind} />
        <HealthTag>{journalCategoryLabels[entry.categories?.[0] ?? 'other']}</HealthTag>
        <span><HighlightedText query={query} text={summary} /></span>
        </>}
        <ChevronRight aria-hidden="true" size={17} />
      </button>
    })}</div>
  </section>)}</div>
}
