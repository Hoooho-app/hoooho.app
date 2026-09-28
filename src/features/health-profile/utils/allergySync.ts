import { readProfileSection, saveProfileSection } from '../../../services/profileSectionStorage'
import { mergeDesensitizationConclusion, readAllergyArchive, serializeAllergyArchive } from './allergyProfile'

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
