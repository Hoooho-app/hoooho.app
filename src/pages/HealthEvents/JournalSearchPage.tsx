import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { HealthTag } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { formatPlainMonthDay, getLocalDateKey } from '../../utils/localCalendarDate'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { JournalRecordDetail } from './JournalRecordDetail'
import { journalCategoryLabels, journalSearchResultSummary, journalTime, searchJournalEntries, type JournalEntry } from './timeViewModel'
import { useJournal } from './useJournal'
import './JournalSearchPage.css'

interface JournalReturnState { day?: string; scrollTop?: number }

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer) }, [delay, value])
  return debounced
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const characters = [...query.trim().replace(/\s+/g, '')]
  if (!characters.length) return text
  const pattern = characters.map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')
  const parts = text.split(new RegExp(`(${pattern})`, 'giu'))
  return <>{parts.map((part, index) => part && (new RegExp(`^${pattern}$`, 'iu').test(part) ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>))}</>
}

function resultDateLabel(day: string, today: string) {
  const yesterdayDate = new Date(`${today}T12:00:00`)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = getLocalDateKey(yesterdayDate)
  return day === today ? `今天 · ${formatPlainMonthDay(day)}` : day === yesterday ? `昨天 · ${formatPlainMonthDay(day)}` : formatPlainMonthDay(day)
}

function groupResults(entries: readonly JournalEntry[]) {
  const groups = new Map<string, JournalEntry[]>()
  for (const entry of entries) {
    const day = getLocalDateKey(entry.occurredAt)
    if (day) groups.set(day, [...(groups.get(day) ?? []), entry])
  }
  return [...groups].map(([day, items]) => ({ day, items }))
}

export function JournalSearchPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAppStore((state) => state.authToken)
  const memberId = useAppStore((state) => state.currentMemberId)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ eventId: string; recordId: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!query) inputRef.current?.focus() }, [query])
  const debouncedQuery = useDebouncedValue(query, 300)
  const { entries, loading, error, retry } = useJournal(memberId, token ?? '', 0)
  const results = useMemo(() => searchJournalEntries(entries, debouncedQuery), [debouncedQuery, entries])
  const groups = useMemo(() => groupResults(results), [results])
  const today = getLocalDateKey(new Date())!
  const returnState = (location.state as { journalReturn?: JournalReturnState } | null)?.journalReturn
  const leaveSearch = () => navigate('/health-events', { replace: true, state: { journalReturn: returnState } })
  const normalizedQuery = debouncedQuery.trim()
  const earliest = results.at(-1)
  const latest = results[0]
  const recentDay = latest ? getLocalDateKey(latest.occurredAt) : null
  const recentLabel = recentDay === today ? '今天' : recentDay === (() => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - 1); return getLocalDateKey(date) })() ? '昨天' : recentDay ? formatPlainMonthDay(recentDay) : ''

  if (!memberId) return <Navigate to="/health-events" replace />

  return <main className="journal-search-page app-shell app-shell--wide">
    <header className="journal-search-header">
      <button aria-label="返回健康随身记" className="journal-search-back" onClick={leaveSearch} type="button"><ChevronLeft size={24} /></button>
      <label className="journal-search-field">
        <Search aria-hidden="true" size={19} />
        <input aria-label="搜索健康随身记" autoFocus enterKeyHint="search" inputMode="search" onChange={(event) => setQuery(event.target.value)} placeholder="输入名称，即可查看发生时间" ref={inputRef} type="search" value={query} />
        {query && <button aria-label="清除搜索" onPointerDown={(event) => event.preventDefault()} onClick={() => { setQuery(''); inputRef.current?.focus() }} type="button"><X size={15} /></button>}
      </label>
      <button className="journal-search-cancel" onClick={leaveSearch} type="button">取消</button>
    </header>

    <section aria-live="polite" className="journal-search-body">
      {normalizedQuery && !loading && !error && results.length > 0 && <>
        <div className="journal-search-summary"><strong>找到 {results.length} 条相关随记</strong><span>最早 {formatPlainMonthDay(getLocalDateKey(earliest!.occurredAt)!)} · 最近 {recentLabel}</span></div>
        <div className="journal-search-results">{groups.map((group) => <section className="journal-search-date-group" key={group.day}>
          <h2>{resultDateLabel(group.day, today)}</h2>
          <div>{group.items.map((entry) => <button className="journal-search-result" key={entry.id} onClick={() => setSelected({ eventId: entry.eventId, recordId: entry.id })} type="button">
            <time>{journalTime(entry).label}</time>
            <JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} />
            <HealthTag>{journalCategoryLabels[entry.categories?.[0] ?? 'other']}</HealthTag>
            <span><HighlightedText query={debouncedQuery} text={journalSearchResultSummary(entry, debouncedQuery)} /></span>
            <ChevronRight aria-hidden="true" size={17} />
          </button>)}</div>
        </section>)}</div>
      </>}
      {normalizedQuery && !loading && !error && results.length === 0 && <div className="journal-search-empty"><strong>没有找到相关随记</strong><span>换个名称试试</span></div>}
      {normalizedQuery && error && <div className="journal-search-empty" role="alert"><strong>{error}</strong><button onClick={retry} type="button">重新加载</button></div>}
    </section>
    {selected && <JournalRecordDetail eventId={selected.eventId} recordId={selected.recordId} onChanged={() => undefined} onClose={() => setSelected(null)} />}
  </main>
}
