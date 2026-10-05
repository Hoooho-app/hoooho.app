import { apiRequest } from './apiClient'
import type { Member } from '../types'

interface Section { memberId: string; sectionId: string; records: unknown[]; revision: number; relatedSections?: Section[] }
const sections = new Map<string, Section>()
let activeToken = ''
let cacheGeneration = 0
let readGeneration = 0
const listeners = new Set<() => void>()
export function subscribeProfileSections(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
const notify = () => { listeners.forEach(listener => listener()) }
const invalidations = new Set<() => void>()
const channel = (() => { try { return typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hoooho-profile-sections-changed') : null } catch { return null } })()
channel?.addEventListener('message', () => { readGeneration++; invalidations.forEach(listener => listener()) })
export function subscribeProfileSectionInvalidation(listener: () => void) { invalidations.add(listener); return () => { invalidations.delete(listener) } }
export function announceProfileSectionsChange() { readGeneration++; channel?.postMessage('updated') }

const keyFor = (item: Pick<Section, 'memberId' | 'sectionId'>) => `hoho-health-profile:${item.memberId}:${item.sectionId}`
export function clearProfileSectionCache() { cacheGeneration++; readGeneration++; sections.clear(); activeToken = ''; notify() }

export async function loadProfileSections(token: string, members: Member[], signal?: AbortSignal) {
  const generation = cacheGeneration, requestId = readGeneration
  const saved = await apiRequest<Section[]>('/api/auth/profile-sections', { token, signal })
  const next = new Map(saved.map((item) => [keyFor(item), item]))
  // Import legacy local archives only for server-confirmed owned members, never
  // overwrite a server archive, and retain the old copy as a recovery source.
  for (const member of members) {
    const prefix = `hoho-health-profile:${member.id}:`
    let keys: string[] = []
    try { keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix)) } catch { /* Storage may be disabled. */ }
    for (const key of keys) {
      if (next.has(key)) continue
      let records: unknown
      try { records = JSON.parse(localStorage.getItem(key) ?? '[]') } catch { continue }
      if (!Array.isArray(records) || !records.length) continue
      const item = await apiRequest<Section>('/api/auth/profile-sections', { token, signal, method: 'POST', body: { memberId: member.id, sectionId: key.slice(prefix.length), records, revision: 0, importOnly: true } })
      next.set(key, item)
      item.relatedSections?.forEach(section => next.set(keyFor(section), section))
    }
  }
  signal?.throwIfAborted()
  if (generation !== cacheGeneration || requestId !== readGeneration) return
  sections.clear()
  next.forEach((value, key) => sections.set(key, value))
  activeToken = token
  notify()
}

export function readProfileSection(key: string) { return JSON.stringify(sections.get(key)?.records ?? []) }
export function readProfileSectionRevision(key: string) { return sections.get(key)?.revision ?? 0 }
export async function saveProfileSection(key: string, records: unknown[], versions?: { revision: number; allergyRevision?: number }) {
  const match = /^hoho-health-profile:([^:]+):([a-z-]+)$/.exec(key)
  if (!match || !activeToken) throw new Error('请先恢复使用状态')
  const generation = cacheGeneration
  // An older in-flight read must not overwrite this committed response.
  readGeneration++
  const saved = await apiRequest<Section>('/api/auth/profile-sections', { token: activeToken, method: 'POST', body: { memberId: match[1], sectionId: match[2], records, revision: versions?.revision ?? sections.get(key)?.revision ?? 0, ...(versions?.allergyRevision !== undefined ? { allergyRevision: versions.allergyRevision } : {}) } })
  if (generation !== cacheGeneration) return
  readGeneration++
  sections.set(key, saved)
  saved.relatedSections?.forEach(section => sections.set(keyFor(section), section))
  announceProfileSectionsChange()
  notify()
}
