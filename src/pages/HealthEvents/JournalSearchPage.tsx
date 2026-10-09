import { ChevronLeft, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { formatPlainMonthDay, getLocalDateKey } from '../../utils/localCalendarDate'
import { JournalSearchResults } from './JournalSearchResults'
import { JournalRecordDetail } from './JournalRecordDetail'
import { searchJournalEntries } from './timeViewModel'
import { useJournal } from './useJournal'
import './JournalSearchPage.css'

interface JournalReturnState { day?: string; scrollTop?: number }

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer) }, [delay, value])
  return debounced
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
  const today = getLocalDateKey(new Date())!
  const returnState = (location.state as { journalReturn?: JournalReturnState } | null)?.journalReturn
  const leaveSearch = () => navigate('/health-events', { replace: true, state: { journalReturn: returnState } })
  const normalizedQuery = debouncedQuery.trim()
  const datedResults=results.filter(entry=>entry.timePrecision!=='unknown')
  const earliest = datedResults.at(-1)
  const latest = datedResults[0]
  const recentDay = latest ? getLocalDateKey(latest.occurredAt) : null
  const recentLabel = recentDay === today ? '今天' : recentDay === (() => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - 1); return getLocalDateKey(date) })() ? '昨天' : recentDay ? formatPlainMonthDay(recentDay) : ''

  if (!memberId) return <Navigate to="/health-events" replace />

  return <main className="journal-search-page app-shell app-shell--wide">
    <header className="journal-search-header">
      <button aria-label="返回健康随记" className="journal-search-back" onClick={leaveSearch} type="button"><ChevronLeft size={24} /></button>
      <label className="journal-search-field">
        <Search aria-hidden="true" size={19} />
        <input aria-label="搜索健康随记" autoFocus enterKeyHint="search" inputMode="search" onChange={(event) => setQuery(event.target.value)} placeholder="输入名称，即可查看发生时间" ref={inputRef} type="search" value={query} />
        {query && <button aria-label="清除搜索" onPointerDown={(event) => event.preventDefault()} onClick={() => { setQuery(''); inputRef.current?.focus() }} type="button"><X size={15} /></button>}
      </label>
      <button className="journal-search-cancel" onClick={leaveSearch} type="button">取消</button>
    </header>

    <section aria-live="polite" className="journal-search-body">
      {normalizedQuery && !loading && !error && results.length > 0 && <>
        <div className="journal-search-summary"><strong>找到 {results.length} 条相关随记</strong><span>{earliest?`已知时间：最早 ${formatPlainMonthDay(getLocalDateKey(earliest.occurredAt)!)} · 最近 ${recentLabel}`:'发生时间未明确'}{datedResults.length<results.length?' · 含时间未知记录':''}</span></div>
        <JournalSearchResults entries={results} query={debouncedQuery} today={today} onOpen={entry => setSelected({ eventId: entry.eventId, recordId: entry.id })} />
      </>}
      {normalizedQuery && !loading && !error && results.length === 0 && <div className="journal-search-empty"><strong>没有找到相关随记</strong><span>换个名称试试</span></div>}
      {normalizedQuery && error && <div className="journal-search-empty" role="alert"><strong>{error}</strong><button onClick={retry} type="button">重新加载</button></div>}
    </section>
    {selected && <JournalRecordDetail eventId={selected.eventId} recordId={selected.recordId} onChanged={retry} onClose={() => setSelected(null)} />}
  </main>
}
