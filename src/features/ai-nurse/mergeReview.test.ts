import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeNurseReview, preserveEditedFields } from './mergeReview'
import type { NurseMetadata, ProfessionalNote } from './types'
const note = (id: string, editedByUser = false): ProfessionalNote => ({ id, category: 'parent_concern', heading: '担心', text: '未确认', sourceTurnIds: ['user'], certainty: 'uncertain', attribution: 'parent', editedByUser, createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z' })
const metadata = (notes: ProfessionalNote[]): NurseMetadata => ({ version: 'nurse-v1', draftId: 'draft', turns: [], professionalNotes: notes, snapshots: [] })
test('incremental organization protects edited notes and deleted notes, preserves new notes', () => {
  const result = mergeNurseReview(metadata([note('edited', true)]), metadata([note('edited'), note('deleted'), note('new')]), ['deleted'])
  assert.deepEqual(result.professionalNotes.map(n => n.id), ['edited', 'new']); assert.equal(result.professionalNotes[0].editedByUser, true)
})
test('manual fields win; absent evidence cannot overwrite existing field', () => {
  assert.deepEqual(preserveEditedFields({ narrative: '人工更正', locationText: '脸颊' }, { narrative: 'AI初稿', locationText: '', triggerText: '家长疑似' }, ['narrative']), { narrative: '人工更正', locationText: '脸颊', triggerText: '家长疑似' })
})
