import type { HealthEventApiDto, HealthEventRecordApiDto, EventAttachmentApiDto } from '../types'
import { apiRequest } from './apiClient'
import { createSharedRequests } from './sharedRequests'

type JournalIndex = { events: HealthEventApiDto[]; records: HealthEventRecordApiDto[]; attachments: EventAttachmentApiDto[] }
export const journalIndexKey = (accountId: string, token: string, memberId: string) => JSON.stringify([accountId, token, memberId, Intl.DateTimeFormat().resolvedOptions().timeZone])
export const journalIndexRequests = createSharedRequests<JournalIndex>((key, signal) => {
  const [, token, memberId] = JSON.parse(key) as string[]
  return apiRequest(`/api/members/${encodeURIComponent(memberId)}/journal-index`, { token, signal })
})
// One invalidator runs before consumer refreshes, so a real save cannot join an
// index snapshot started before that save. Unmounting a consumer does not abort peers.
if (typeof window !== 'undefined') window.addEventListener('hoooho-data-changed', () => journalIndexRequests.invalidate())
