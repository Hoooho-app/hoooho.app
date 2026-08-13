import type { HealthProfileSectionId } from '../config/healthProfileSections'

export interface BasicHealthProfileSource {
  bloodType?: 'A' | 'B' | 'AB' | 'O'
  heightCm?: number
  weightKg?: number
  waistCircumferenceCm?: number
  bodyFatPercentage?: number
  headCircumferenceCm?: number
  rhBloodType?: 'positive' | 'negative'
}

export type BasicHealthProfileValues = Record<string, string | boolean>

const asText = (value: number | undefined) => value?.toString() ?? ''

export function getBasicHealthProfileValues(
  member: BasicHealthProfileSource,
  fallback: BasicHealthProfileValues = {}
): BasicHealthProfileValues {
  return {
    height: asText(member.heightCm) || String(fallback.height ?? ''),
    weight: asText(member.weightKg) || String(fallback.weight ?? ''),
    waistCircumference: asText(member.waistCircumferenceCm) || String(fallback.waistCircumference ?? ''),
    bodyFatPercentage: asText(member.bodyFatPercentage) || String(fallback.bodyFatPercentage ?? ''),
    headCircumference: asText(member.headCircumferenceCm) || String(fallback.headCircumference ?? ''),
    bloodType: member.bloodType ?? String(fallback.bloodType ?? ''),
    rhBloodType: member.rhBloodType ?? String(fallback.rhBloodType ?? '')
  }
}

export function hasBasicHealthProfileValues(member: BasicHealthProfileSource): boolean {
  return member.heightCm != null
    || member.weightKg != null
    || member.waistCircumferenceCm != null
    || member.bodyFatPercentage != null
    || member.headCircumferenceCm != null
    || Boolean(member.bloodType)
    || Boolean(member.rhBloodType)
}

export function getInitialHealthProfileRecords(
  sectionId: HealthProfileSectionId,
  storedRecords: readonly BasicHealthProfileValues[],
  member: BasicHealthProfileSource
): BasicHealthProfileValues[] {
  if (sectionId !== 'basic') return [...storedRecords]
  const values = getBasicHealthProfileValues(member, storedRecords[0])
  return hasBasicHealthProfileValues(member) || Object.values(values).some(Boolean)
    ? [{ ...values, _savedAt: 'member-health-profile' }]
    : []
}

function optionalNumber(value: string | boolean | undefined) {
  const normalized = String(value ?? '').trim()
  return normalized ? Number(normalized) : null
}

export function calculateBmi(height: string | boolean | undefined, weight: string | boolean | undefined) {
  const heightCm = optionalNumber(height)
  const weightKg = optionalNumber(weight)
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return ''
  return (weightKg / ((heightCm / 100) ** 2)).toFixed(1)
}

export function toFamilyMemberHealthUpdate(values: BasicHealthProfileValues) {
  const bloodType = String(values.bloodType ?? '').trim()
  const rhBloodType = String(values.rhBloodType ?? '').trim()

  return {
    heightCm: optionalNumber(values.height),
    weightKg: optionalNumber(values.weight),
    waistCircumferenceCm: optionalNumber(values.waistCircumference),
    bodyFatPercentage: optionalNumber(values.bodyFatPercentage),
    headCircumferenceCm: optionalNumber(values.headCircumference),
    bloodType: (bloodType || null) as 'A' | 'B' | 'AB' | 'O' | null,
    rhBloodType: (rhBloodType || null) as 'positive' | 'negative' | null
  }
}
