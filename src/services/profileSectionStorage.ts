import { apiRequest } from './apiClient'
import type { Member } from '../types'

interface Section { memberId: string; sectionId: string; records: unknown[]; revision: number }
const sections = new Map<string, Section>()
let activeToken = ''
const keyFor = (item: Pick<Section, 'memberId' | 'sectionId'>) => `hoho-health-profile:${item.memberId}:${item.sectionId}`
export function clearProfileSectionCache() { sections.clear(); activeToken = '' }

export async function loadProfileSections(token: string, members: Member[], signal?: AbortSignal) {
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
    }
  }
  sections.clear()
  next.forEach((value, key) => sections.set(key, value))
  activeToken = token
}

export function readProfileSection(key: string) { return JSON.stringify(sections.get(key)?.records ?? []) }
export async function saveProfileSection(key: string, records: unknown[]) {
  const match = /^hoho-health-profile:([^:]+):([a-z-]+)$/.exec(key)
  if (!match || !activeToken) throw new Error('请先恢复使用状态')
  const saved = await apiRequest<Section>('/api/auth/profile-sections', { token: activeToken, method: 'POST', body: { memberId: match[1], sectionId: match[2], records, revision: sections.get(key)?.revision ?? 0 } })
  sections.set(key, saved)
}
