const twoHours = 2 * 60 * 60 * 1000

const clean = (value) => String(value ?? '').toLowerCase().replace(/[，。！？、,.!?\s]/g, '').replace(/\d+号区域/g, '区域')
const chars = (value) => new Set([...clean(value)])
const similarity = (left, right) => {
  const a = chars(left); const b = chars(right)
  if (!a.size || !b.size) return 0
  const common = [...a].filter((item) => b.has(item)).length
  return common / Math.max(a.size, b.size)
}
const categories = (journal) => journal?.categories ?? []
const locationRoot = (location) => clean(location?.label ?? location?.id).replace(/(左|右|前|后|顶部|上部|下部|区域)/g, '')
const locationsRelated = (left = [], right = []) => left.some((a) => right.some((b) => {
  const x = locationRoot(a); const y = locationRoot(b)
  return x && y && (x === y || x.includes(y) || y.includes(x) || (/[头额面]/.test(x) && /[头额面]/.test(y)))
}))

function structuredMatch(input, record) {
  const next = input.journal ?? {}; const previous = record.journal ?? {}
  const shared = categories(next).filter((item) => categories(previous).includes(item))
  if (!shared.length) return { match: !categories(next).length && !categories(previous).length && similarity(input.content, record.content) >= .88 }
  if (input.photoIds?.length) return { match: false, important: true }
  if (shared.includes('medication')) {
    const a = next.medication; const b = previous.medication
    return { match: Boolean(a?.medicationName && clean(a.medicationName) === clean(b?.medicationName) && a.amountValue === b.amountValue && a.amountUnit === b.amountUnit) }
  }
  if (shared.includes('visit')) {
    const a = next.visit; const b = previous.visit
    return { match: Boolean(a?.visitType && a.visitType === b?.visitType && clean(a.institutionName) === clean(b?.institutionName)) }
  }
  if (shared.includes('symptom')) {
    const a = next.symptom; const b = previous.symptom
    const sameSymptom = a?.symptomCategory === b?.symptomCategory || similarity(input.content, record.content) >= .55
    const relatedLocation = locationsRelated(a?.locations, b?.locations) || similarity(input.content, record.content) >= .72
    const important = a?.impactLevel && b?.impactLevel && a.impactLevel !== b.impactLevel
      || a?.trend && b?.trend && a.trend !== b.trend
      || Boolean(a?.locations?.length && b?.locations?.length && !relatedLocation)
    return { match: Boolean(sameSymptom && relatedLocation), important }
  }
  return { match: similarity(input.content, record.content) >= .76 }
}

export async function findQuickRecordDuplicate({ accountId, input, events, records, now = new Date() }) {
  const occurred = Date.parse(input.occurredAt)
  if (!Number.isFinite(occurred)) return null
  const eventRows = await events.repository.findByAccountId(accountId)
  const recordRows = await records.repository.findByAccountId(accountId)
  const candidates = []
  for (const event of eventRows) {
    if (event.memberId !== input.memberId || event.recoveredAt || event.status === 'recovered') continue
    for (const record of recordRows.filter((item) => item.eventId === event.id)) {
      const distance = Math.abs(occurred - Date.parse(record.occurredAt))
      const sharedCategories = categories(input.journal).filter((item) => categories(record.journal).includes(item))
      const window = sharedCategories.includes('medication') ? 10 * 60 * 1000 : sharedCategories.includes('visit') ? 30 * 60 * 1000 : twoHours
      if (!Number.isFinite(distance) || distance > window) continue
      const result = structuredMatch(input, record)
      if (!result.match) continue
      candidates.push({ event, record, distance, important: Boolean(result.important), score: similarity(input.content, record.content) })
    }
  }
  const best = candidates.sort((a, b) => a.distance - b.distance || b.score - a.score)[0]
  if (!best) return null
  const rootRecordId = best.record.note?.startsWith('event-update:') ? best.record.note.slice('event-update:'.length) : best.record.id
  const rootRecord = recordRows.find((record) => record.id === rootRecordId && record.eventId === best.event.id) ?? best.record
  const changeSummary = best.important ? input.content.trim() : ''
  return {
    eventId: best.event.id,
    recordId: rootRecord.id,
    occurredAt: rootRecord.occurredAt,
    summary: rootRecord.content,
    hasClearChange: Boolean(changeSummary),
    changeSummary
  }
}
