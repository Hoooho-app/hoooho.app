import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import { announceProfileSectionsChange, loadProfileSections, subscribeProfileSectionInvalidation } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'

export type ArchiveRecord = Record<string, unknown> & { id?: string }
export type ArchiveSnapshot = { records: ArchiveRecord[]; revision: number }
type Section = ArchiveSnapshot & { memberId: string; sectionId: string }

/** Existing account/member section API, with the version captured when editing. */
export function useProfileArchive(memberId: string, sectionId: string) {
  const token = useAppStore(s => s.authToken), accountId = useAppStore(s => s.authUser?.id)
  const [snapshot, setSnapshot] = useState<ArchiveSnapshot>({ records: [], revision: 0 })
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reload, setReload] = useState(0), mounted = useRef(false), locked = useRef(false), generation = useRef(0)
  const isCurrent = () => { const s = useAppStore.getState(); return s.currentMemberId === memberId && s.authUser?.id === accountId }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++ } }, [])
  useEffect(() => {
    const refresh = () => { if (!locked.current) setReload(v => v + 1) }
    const unsubscribe = subscribeProfileSectionInvalidation(refresh)
    window.addEventListener('focus', refresh)
    return () => { unsubscribe(); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => {
    const controller = new AbortController(), version = ++generation.current
    if (!token) return
    setLoading(true); setError('')
    void apiRequest<Section[]>('/api/auth/profile-sections', { token, signal: controller.signal }).then(items => {
      if (!controller.signal.aborted && version === generation.current && isCurrent()) {
        const section = items.find(s => s.memberId === memberId && s.sectionId === sectionId)
        setSnapshot({ records: section?.records ?? [], revision: section?.revision ?? 0 })
        setLoaded(true)
      }
    }).catch(e => { if (!controller.signal.aborted && version === generation.current) setError(e instanceof Error ? e.message : '资料暂未读取，请重试') })
      .finally(() => { if (!controller.signal.aborted && version === generation.current) setLoading(false) })
    return () => controller.abort()
  }, [token, accountId, memberId, sectionId, reload])
  async function save(records: ArchiveRecord[], revision: number) {
    if (locked.current) throw new Error('正在保存，请稍候')
    if (!isCurrent()) throw new Error('孩子或账号已切换，内容未提交')
    if (new TextEncoder().encode(JSON.stringify(records)).length > 18_000_000) throw new Error('本类资料过大，请减少附件后再保存')
    locked.current = true; generation.current++; setBusy(true); setError('')
    try {
      const s = useAppStore.getState(), saved = await apiRequest<Section>('/api/auth/profile-sections', { token: s.authToken ?? '', method: 'POST', body: { memberId, sectionId, records, revision } })
      if (mounted.current && isCurrent()) { setSnapshot({ records: saved.records, revision: saved.revision }); setLoading(false) }
      announceProfileSectionsChange()
      if (isCurrent()) void loadProfileSections(useAppStore.getState().authToken ?? '', useAppStore.getState().members).catch(() => {})
    } finally { locked.current = false; if (mounted.current) { setBusy(false); setLoading(false) } }
  }
  return { ...snapshot, snapshot, loading, loaded, error, busy, save, refresh: () => setReload(v => v + 1) }
}
