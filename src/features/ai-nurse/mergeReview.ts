import type { NurseFields, NurseMetadata } from './types'
export function mergeNurseReview(current: NurseMetadata | undefined, incoming: NurseMetadata, deletedIds: string[] = []) {
  if (!current || current.draftId !== incoming.draftId) return incoming
  const protectedNotes = current.professionalNotes.filter(n => n.editedByUser)
  const protectedIds = new Set(protectedNotes.map(n => n.id))
  return { ...incoming, editedFields: [...new Set([...(incoming.editedFields ?? []), ...(current.editedFields ?? [])])], professionalNotes: [...protectedNotes, ...incoming.professionalNotes.filter(n => !protectedIds.has(n.id) && !deletedIds.includes(n.id))] }
}
export function preserveEditedFields<T extends Partial<NurseFields>>(current: T, incoming: Partial<NurseFields>, edited: string[]) {
  return { ...current, ...Object.fromEntries(Object.entries(incoming).filter(([key, value]) => value !== '' && !edited.includes(key))) }
}
