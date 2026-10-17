import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { ApiRequestError } from '../../services/apiClient'
import { journalIndexKey, journalIndexRequests } from '../../services/journalIndexRequests'
import { flattenJournal, type JournalEntry } from './timeViewModel'

function sessionStorageAvailable(key: string) { try { return sessionStorage.getItem(key) !== null } catch { return false } }

export function useJournal(memberId: string, token: string, revision: number): { entries: JournalEntry[]; sourceEntries: JournalEntry[]; loading: boolean; error: string; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1)
    window.addEventListener('hoooho-data-changed', refresh)
    return () => window.removeEventListener('hoooho-data-changed', refresh)
  }, [])
  const accountId = useAppStore(s => s.authUser?.id ?? '')
  const scope = `${accountId}:${token}:${memberId}`
  const cacheKey = `hoooho-journal-cache:${accountId}:${memberId}`
  const readCache = () => { try { return JSON.parse(sessionStorage.getItem(cacheKey) ?? '[]') as JournalEntry[] } catch { return [] } }
  const readSources = () => { try { return JSON.parse(sessionStorage.getItem(`${cacheKey}:sources`) ?? '[]') as JournalEntry[] } catch { return [] } }
  const [state, setState] = useState<{ scope: string; memberId: string; entries: JournalEntry[]; sourceEntries: JournalEntry[]; loading: boolean; error: string }>(() => ({ scope, memberId, entries: readCache(), sourceEntries: readSources(), loading: true, error: '' }))
  useEffect(() => {
    let active = true
    const cached = readCache()
    setState({ scope, memberId, entries: cached, sourceEntries: readSources(), loading: sessionStorageAvailable(cacheKey) === false, error: '' })
    const load = async () => {
      try {
        const index = await journalIndexRequests.get(journalIndexKey(accountId, token, memberId))
        const events = index.events.filter(event => event.memberId === memberId && event.accountId === accountId)
        const results = events.map(event => ({ event, records: index.records.filter(record => record.eventId === event.id && record.accountId === event.accountId), attachments: index.attachments.filter(file => file.eventId === event.id && file.accountId === event.accountId) }))
        if (active) {
          const entries = flattenJournal(events, new Map(results.map((item) => [item.event.id, item.records])), new Map(results.map((item) => [item.event.id, item.attachments])), memberId)
          const sourceEntries = results.flatMap(({event, records, attachments}) => records.length ? records.flatMap(record => flattenJournal([event], new Map([[event.id, [record]]]), new Map([[event.id, attachments]]), memberId)) : flattenJournal([event], new Map(), new Map([[event.id, attachments]]), memberId))
          try {
            sessionStorage.setItem(`${cacheKey}:sources`, JSON.stringify(sourceEntries))
            sessionStorage.setItem(cacheKey, JSON.stringify(entries))
          } catch { /* A full/unavailable cache must not discard successful data. */ }
          setState({ scope, memberId, entries, sourceEntries, loading: false, error: '' })
        }
      } catch (error) {
        if (active) setState({ scope, memberId, entries: cached, sourceEntries: readSources(), loading: false, error: error instanceof ApiRequestError && error.status === 401 ? '登录状态已失效，请重新登录' : '记录加载失败，请重试' })
      }
    }
    if (token && memberId) void load()
    return () => { active = false }
  }, [memberId, token, revision, attempt, cacheKey, scope])
  return { ...(state.scope === scope ? state : { entries: [], sourceEntries: [], loading: true, error: '' }), retry: () => { journalIndexRequests.invalidate(journalIndexKey(accountId, token, memberId)); setAttempt((value) => value + 1) } }
}
