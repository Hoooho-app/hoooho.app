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

export function combineBloodType(
  bloodType: BasicHealthProfileSource['bloodType'] | string | undefined,
  rhBloodType: BasicHealthProfileSource['rhBloodType'] | string | undefined
) {
  if (!bloodType || !rhBloodType) return ''
  return `${bloodType}${rhBloodType === 'positive' ? '+' : '-'}`
}

export function splitBloodType(value: string | boolean | undefined) {
  const match = String(value ?? '').match(/^(A|B|AB|O)([+-])$/)
  return match
    ? { bloodType: match[1] as 'A' | 'B' | 'AB' | 'O', rhBloodType: match[2] === '+' ? 'positive' as const : 'negative' as const }
    : { bloodType: null, rhBloodType: null }
}

export function getBasicHealthProfileValues(
  member: BasicHealthProfileSource,
  fallback: BasicHealthProfileValues = {}
): BasicHealthProfileValues {
  const legacyCombined = splitBloodType(fallback.combinedBloodType)
  const fallbackBloodType = String(fallback.aboBloodType ?? fallback.bloodType ?? legacyCombined.bloodType ?? '')
  const fallbackRhBloodType = String(fallback.rhBloodType ?? legacyCombined.rhBloodType ?? '')
  const bloodType = member.bloodType ?? fallbackBloodType
  const rhBloodType = member.rhBloodType ?? fallbackRhBloodType
  return {
    height: asText(member.heightCm) || String(fallback.height ?? ''),
    weight: asText(member.weightKg) || String(fallback.weight ?? ''),
    waistCircumference: asText(member.waistCircumferenceCm) || String(fallback.waistCircumference ?? ''),
    bodyFatPercentage: asText(member.bodyFatPercentage) || String(fallback.bodyFatPercentage ?? ''),
    aboBloodType: bloodType,
    rhBloodType,
    otherBloodTypeInfo: String(fallback.otherBloodTypeInfo ?? ''),
    combinedBloodType: combineBloodType(bloodType, rhBloodType) || String(fallback.combinedBloodType ?? ''),
    _originalBloodType: member.bloodType ?? String(fallback._originalBloodType ?? fallback.bloodType ?? ''),
    _originalRhBloodType: member.rhBloodType ?? String(fallback._originalRhBloodType ?? fallback.rhBloodType ?? '')
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
  const combined = splitBloodType(values.combinedBloodType)
  const selectedBloodType = String(values.aboBloodType ?? combined.bloodType ?? '')
  const selectedRhBloodType = String(values.rhBloodType ?? combined.rhBloodType ?? '')
  const preserveLegacyBloodType = !values._bloodTypeTouched && !values._combinedBloodTypeTouched && !selectedBloodType && !selectedRhBloodType
  const bloodType = preserveLegacyBloodType ? String(values._originalBloodType ?? '') || null : selectedBloodType || null
  const rhBloodType = preserveLegacyBloodType ? String(values._originalRhBloodType ?? '') || null : selectedRhBloodType || null

  return {
    heightCm: optionalNumber(values.height),
    weightKg: optionalNumber(values.weight),
    waistCircumferenceCm: optionalNumber(values.waistCircumference),
    bodyFatPercentage: optionalNumber(values.bodyFatPercentage),
    bloodType: bloodType as 'A' | 'B' | 'AB' | 'O' | null,
    rhBloodType: rhBloodType as 'positive' | 'negative' | null
  }
}
