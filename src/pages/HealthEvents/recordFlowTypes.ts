import type { JournalMetadata, JournalSaveResult } from '../../types/journal'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'

export type RecordInputChannel = 'voice' | 'text'
export type SaveJournalRecord = (content: string, occurredAt: string, channel: RecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata, context?: { nestedBackfill?: boolean }) => Promise<JournalSaveResult>

export const JOURNAL_SAVED_FLASH_KEY = 'hoooho:journal-saved-flash'

export interface RecordRelationContext {
  parentType: 'symptom' | 'daily' | 'medication'
  relation: 'daily' | 'visit' | 'medication' | 'symptom'
}

export interface LinkedBackfillResult {
  relation: 'daily' | 'visit' | 'medication' | 'symptom'
  recordId: string
  nonce: number
}
