export const HEALTH_FACT_CATEGORIES = [
  'symptom', 'measurement', 'medication', 'examination', 'diagnosis', 'visit', 'concern', 'status_change', 'other'
]
export const HEALTH_FACT_POLARITIES = ['affirmed', 'negated', 'uncertain']
export const HEALTH_FACT_TEMPORALITIES = ['current', 'historical', 'future', 'conditional', 'unknown']
export const HEALTH_FACT_STATUSES = ['active', 'improving', 'resolved', 'recurrent', 'planned', 'not_applicable', 'unknown']
export const HEALTH_FACT_SUBJECTS = ['event_subject', 'family_member', 'other_person', 'unknown']
export const HEALTH_FACT_SOURCES = [
  'user_report', 'measurement', 'doctor_statement', 'test_result', 'ai_consultation', 'structured_input', 'quoted_text', 'internet_information', 'unknown'
]
export const HEALTH_MEDICATION_ACTIONS = ['taken', 'not_taken', 'planned', 'available', 'stopped', 'unknown']
export const HEALTH_DIAGNOSIS_CERTAINTIES = ['confirmed', 'suspected', 'ruled_out', 'pending', 'unknown']

const currentStatuses = new Set(['active', 'improving', 'recurrent'])
const excludedSources = new Set(['quoted_text', 'internet_information'])

export function isCurrentPositiveFact(fact) {
  return fact?.subject === 'event_subject'
    && fact?.polarity === 'affirmed'
    && fact?.temporality === 'current'
    && currentStatuses.has(fact?.status)
    && !excludedSources.has(fact?.source)
}

export function isCurrentPositiveSymptom(fact) {
  return fact?.type === 'symptom' && isCurrentPositiveFact(fact)
}

export function isUsableMeasurement(fact) {
  return fact?.type === 'temperature'
    && fact?.measurementType === 'body_temperature'
    && isCurrentPositiveFact(fact)
    && Number.isFinite(fact?.temperature?.min)
    && Number.isFinite(fact?.temperature?.max)
}

export function isConsumedMedication(fact) {
  return fact?.type === 'medication'
    && fact?.medicationAction === 'taken'
    && isCurrentPositiveFact(fact)
}

export function isConfirmedDiagnosis(fact) {
  return fact?.type === 'diagnosis'
    && fact?.diagnosisCertainty === 'confirmed'
    && isCurrentPositiveFact(fact)
}

export function isDisplayableFact(fact) {
  if (!fact) return false
  if (fact.type === 'symptom') return isCurrentPositiveSymptom(fact)
  if (fact.type === 'temperature') return isUsableMeasurement(fact)
  if (fact.type === 'medication') return isConsumedMedication(fact)
  if (fact.type === 'diagnosis') return isConfirmedDiagnosis(fact)
  if (fact.type === 'status_change') return fact.subject === 'event_subject' && fact.polarity === 'affirmed'
  return fact.subject === 'event_subject'
    && fact.polarity === 'affirmed'
    && !excludedSources.has(fact.source)
    && fact.temporality !== 'future'
    && fact.temporality !== 'conditional'
}

export function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}
