import type { HealthProfileSectionId } from '../config/healthProfileSections'

export interface BasicHealthProfileSource {
  bloodType?: 'A' | 'B' | 'AB' | 'O'
  heightCm?: number
  weightKg?: number
}

export type BasicHealthProfileValues = Record<string, string | boolean>

export function getBasicHealthProfileValues(
  member: BasicHealthProfileSource
): BasicHealthProfileValues {
  return {
    height: member.heightCm?.toString() ?? '',
    weight: member.weightKg?.toString() ?? '',
    bloodType: member.bloodType ?? ''
  }
}

export function hasBasicHealthProfileValues(member: BasicHealthProfileSource): boolean {
  return member.heightCm != null || member.weightKg != null || Boolean(member.bloodType)
}

export function getInitialHealthProfileRecords(
  sectionId: HealthProfileSectionId,
  storedRecords: readonly BasicHealthProfileValues[],
  member: BasicHealthProfileSource
): BasicHealthProfileValues[] {
  if (storedRecords.length > 0 || sectionId !== 'basic' || !hasBasicHealthProfileValues(member)) {
    return [...storedRecords]
  }

  return [{
    ...getBasicHealthProfileValues(member),
    _savedAt: 'member-health-profile'
  }]
}

export function toFamilyMemberHealthUpdate(values: BasicHealthProfileValues) {
  const height = String(values.height ?? '').trim()
  const weight = String(values.weight ?? '').trim()
  const bloodType = String(values.bloodType ?? '').trim()

  return {
    heightCm: height ? Number(height) : null,
    weightKg: weight ? Number(weight) : null,
    bloodType: (bloodType && bloodType !== '未知' ? bloodType : null) as 'A' | 'B' | 'AB' | 'O' | null
  }
}
