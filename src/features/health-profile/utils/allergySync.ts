import { readProfileSection, saveProfileSection } from '../../../services/profileSectionStorage'
import { mergeDesensitizationConclusion, readAllergyArchive, reconcileDesensitizationObservation, serializeAllergyArchive } from './allergyProfile'

export async function syncDesensitizationConclusionToAllergy(input: {
  accountId: string
  memberId: string
  taskId: string
  name: string
  conclusion: 'confirmed' | 'investigating'
  observationIds: string[]
  occurredAt: string
}) {
  const key = `hoho-health-profile:${input.memberId}:allergy`
  const archive = readAllergyArchive(readProfileSection(key), input.memberId, input.accountId)
  const items = mergeDesensitizationConclusion(archive.items, input)
  await saveProfileSection(key, serializeAllergyArchive({ ...archive, items }))
}

export async function syncDesensitizationObservationToAllergy(input: {
  accountId: string
  memberId: string
  taskId: string
  recordId: string
  action: 'withdraw' | 'restore' | 'update'
  occurredAt: string
}) {
  const key = `hoho-health-profile:${input.memberId}:allergy`
  const archive = readAllergyArchive(readProfileSection(key), input.memberId, input.accountId)
  const items = reconcileDesensitizationObservation(archive.items, input)
  if (items.every((item, index) => item === archive.items[index])) return
  await saveProfileSection(key, serializeAllergyArchive({ ...archive, items }))
}
