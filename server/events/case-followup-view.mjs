import { symptomCorePhrase } from '../../shared/symptom-core-phrase.mjs'
// Read-only presentation projection. Never changes original records or diagnoses.
export const knownOccurrence = record => !record.caseContext?.timeUnknown && record.journal?.timePrecision !== 'unknown' && Number.isFinite(Date.parse(record.occurredAt))
export function caseFollowupView(event, records) {
  const known = records.filter(knownOccurrence).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const symptom = [...records].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).find(r => r.journal?.symptom) ?? records.find(r => r.type === 'symptom')
  const details = symptom?.journal?.symptom
  const raw = details?.generatedSummary || details?.keywords?.join('、') || details?.narrative || symptom?.aiProvenance?.fields?.find(field => field.name === 'symptom')?.value || event.title || symptom?.content || ''
  const title = symptomCorePhrase(raw, {location: details?.locationText || details?.locations?.map(value => value.label).join('、') || ''})
  const supplement = details?.shortNote?.trim() || symptom?.caseContext?.supplement?.trim() || ''
  const hasSymptom = records.some(r => r.type === 'symptom' || r.journal?.categories?.includes('symptom') || r.journal?.symptom) || event.category !== 'other'
  const description = details?.narrative?.trim() || symptom?.caseContext?.originalText?.trim() || symptom?.sourceText?.trim() || symptom?.content?.trim() || null
  const keyword = details?.keywords?.find(value => typeof value === 'string' && value.trim())?.trim() || null
  return { title: event.caseTitle || title, description, keyword, hasSymptom, supplement: supplement && !raw.includes(supplement) && !supplement.includes(title.replace(/…$/, '')) ? supplement : null, recordCount: records.length, firstOccurredAt: known[0]?.occurredAt ?? null, latestOccurredAt: known.at(-1)?.occurredAt ?? null, hasUnknownTime: known.length < records.length }
}
