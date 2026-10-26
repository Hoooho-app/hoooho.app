import { symptomItemCorePhrase } from '../../../shared/symptom-core-phrase.mjs'

const clone = value => structuredClone(value)
const array = value => Array.isArray(value) ? value : []
const refs = item => [...array(item?.fields).flatMap(field => array(field.sources)), ...array(item?.timeSources)]
const saved = fact => fact?.saved === true || fact?.status === 'saved' || Boolean(fact?.recordId) || array(fact?.recordIds).length > 0
const key = source => `${source.id}:${source.page ?? 1}`
const refKey = ref => `${ref.sourceId}:${ref.page ?? 1}`
const identities = fact => new Set([fact?.id, fact?.sourceMessageId, ...array(fact?.sources).flatMap(source => [source.sourceId, source.messageId, source.attachmentId])].filter(Boolean))

function cites(ref, fact, value = '') {
  if (!ref || !fact) return false
  if (ref.sourceId === fact.id) return true
  if (!identities(fact).has(ref.sourceId)) return false
  // One message may contain several facts. A shared message ID alone is not a match.
  const text = String(fact.text ?? ''), quote = String(ref.quote ?? '')
  return Boolean(text && quote && (text.includes(quote) || quote.includes(text) || value && text.includes(value) && quote.includes(value)))
}

const itemCites = (item, fact) => array(item?.fields).some(field => array(field.sources).some(ref => cites(ref, fact, field.value))) || array(item?.timeSources).some(ref => cites(ref, fact, item.timeText))

function validRefs(references, value, available) {
  return array(references).filter(ref => {
    const source = available.get(refKey(ref))
    return source && typeof ref.quote === 'string' && ref.quote.length > 0 && typeof source.text === 'string' && source.text.includes(ref.quote) && (!value || ref.quote.includes(value))
  })
}

function timeRefs(item, available) {
  const existing = validRefs(item?.timeSources, item?.timeText, available)
  if (existing.length || !item?.timeText) return existing
  return [...new Set(array(item.fields).flatMap(field => array(field.sources).map(refKey)))].flatMap(id => {
    const source = available.get(id)
    return typeof source?.text === 'string' && source.text.includes(item.timeText) ? [{ sourceId: source.id, page: source.page ?? 1, quote: item.timeText }] : []
  })
}

function review(item, reason) {
  return { ...item, subject: 'unknown', subjectConfirmed: false, unassigned: true, needsReview: true, revisionIssue: reason }
}

function cleanDerived(item) {
  const result = { ...item }
  for (const field of ['journal', 'professionalSummary', 'professionalSummaryConfirmed', 'time', 'timeResolution', 'occurredAt', 'originalTimeText', 'summary', 'summaryConfirmed']) delete result[field]
  return result
}

function pruneRetracted(item, withdrawn, available) {
  const result = clone(item)
  result.fields = array(result.fields).flatMap(field => {
    const sources = validRefs(field.sources, field.value, available).filter(ref => !withdrawn.some(fact => cites(ref, fact, field.value)))
    return sources.length ? [{ ...field, sources }] : []
  })
  const timeSources = validRefs(result.timeSources, result.timeText, available).filter(ref => !withdrawn.some(fact => cites(ref, fact, result.timeText)))
  if (array(result.timeSources).length && !timeSources.length) {
    result.timeText = null
    delete result.timeEditedBy
  }
  result.timeSources = timeSources
  return result
}

function literalTimeCorrection(old, change, replacement, available) {
  if (!old.timeText || !validRefs(old.timeSources, old.timeText, available).length) return null
  // This recognizes a literal replacement of a known time, not a new date guess.
  const escaped = String(old.timeText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^(?:不是|不对[，,：:]?\\s*不是)\\s*${escaped}\\s*[，,；;]\\s*(?:而)?是\\s*([^，,。.!！?？；;]+)[。.!！]?\\s*$`, 'u').exec(String(change.text ?? '').trim())
  const value = match?.[1]?.trim()
  if (!value || !replacement) return null
  const sources = [...available.values()].filter(source => identities(replacement).has(source.id) && typeof source.text === 'string' && source.text.includes(value)).map(source => ({ sourceId: source.id, page: source.page ?? 1, quote: value }))
  return sources.length ? { timeText: value, timeSources: sources } : null
}

/**
 * Reconcile only explicitly targeted draft revisions. `items` is the current
 * extraction; old items outside a revision are never revived as new evidence.
 * The complete ledger (including superseded/retracted facts) is required.
 * Old source text is returned only when a surviving field still cites it;
 * callers must not submit these retained sources for a fresh extraction.
 */
export function reconcileFrontDeskRevisions({ items = [], previousItems = [], changes = [], facts = [], sources = [], previousSources = [] } = {}) {
  const current = clone(array(items)), previous = clone(array(previousItems))
  const ledger = new Map(array(facts).map(fact => [fact.id, fact]))
  const available = new Map([...array(previousSources), ...array(sources)].map(source => [key(source), clone(source)]))
  const revisions = array(changes).filter(change => ['correct', 'retract'].includes(change?.type))
  const withdrawn = revisions.filter(change => change.type === 'retract' && !saved(ledger.get(change.targetId))).map(change => ledger.get(change.targetId)).filter(Boolean)
  const consumed = new Set(), reconciled = new Map()

  for (const change of revisions) {
    const target = ledger.get(change.targetId)
    if (!target) continue
    const oldMatches = previous.map((item, index) => itemCites(item, target) ? index : -1).filter(index => index >= 0)
    const replacement = array(facts).find(fact => fact.replaces === target.id && fact.changeId === change.id && fact.status === 'active')
      ?? array(facts).find(fact => fact.changeId === change.id && fact.status === 'active')
    const newMatches = current.map((item, index) => replacement && itemCites(item, replacement) ? index : -1).filter(index => index >= 0)
    if (saved(target)) {
      for (const index of newMatches) current[index] = review(current[index], 'saved_fact_is_immutable')
      continue
    }
    if (change.type === 'retract') {
      for (const index of oldMatches) {
        const result = cleanDerived(pruneRetracted(reconciled.get(index) ?? previous[index], withdrawn, available))
        reconciled.set(index, result.fields.length ? result : null)
      }
      continue
    }
    // Before the first candidate, fresh extraction may use explicitly retained
    // original fragments plus the current amendment; there is no old item to merge.
    if(!previous.length&&!oldMatches.length)continue
    if (oldMatches.length !== 1 || newMatches.length > 1) {
      for (const index of newMatches) current[index] = review(current[index], 'revision_target_ambiguous')
      for (const index of oldMatches) reconciled.set(index, null)
      continue
    }
    const oldIndex = oldMatches[0], old = reconciled.has(oldIndex) ? reconciled.get(oldIndex) : previous[oldIndex]
    if (!old) continue
    const freshIndex = newMatches[0], fresh = freshIndex === undefined ? null : current[freshIndex]
    const timeCorrection = literalTimeCorrection(old, change, replacement, available)
    const explicitSubject = replacement?.subject && array(replacement.subject.sources).length ? replacement.subject : null
    if (!fresh && !timeCorrection && !explicitSubject) {
      reconciled.set(oldIndex, null)
      continue
    }
    if (fresh && fresh.category && fresh.category !== old.category && fresh.category !== 'other' && array(fresh.fields).length) {
      current[freshIndex] = review(fresh, 'revision_category_ambiguous')
      reconciled.set(oldIndex, null)
      continue
    }
    const retained = pruneRetracted(old, withdrawn, available)
    const newFields = array(fresh?.fields).flatMap(field => {
      const references = validRefs(field.sources, field.value, available)
      return references.length ? [{ ...field, sources: references }] : []
    })
    const replacedNames = new Set(newFields.map(field => field.name))
    let result = cleanDerived({ ...retained, ...(fresh ?? {}), category: old.category, fields: [...retained.fields.filter(field => !replacedNames.has(field.name)), ...newFields] })
    const freshTime = fresh?.timeText && timeRefs(fresh, available)
    if (freshTime?.length) result = { ...result, timeText: fresh.timeText, timeSources: freshTime }
    else if (timeCorrection) result = { ...result, ...timeCorrection }
    else result = { ...result, timeText: retained.timeText ?? null, timeSources: retained.timeSources }
    if (freshTime?.length || timeCorrection) delete result.timeEditedBy
    if (explicitSubject) result = { ...result, subject: explicitSubject.kind, subjectResolution: clone(explicitSubject), subjectConfirmed: explicitSubject.confirmed === true }
    if (explicitSubject && (explicitSubject.kind !== 'current' || explicitSubject.confirmed !== true)) result = review(result, 'subject_requires_confirmation')
    if (['unknown', 'planned', 'quoted', 'concern'].includes(replacement?.polarity)) result = review(result, 'revision_is_not_confirmed_occurrence')
    result.title = result.category === 'symptom' ? symptomItemCorePhrase(result) : result.fields[0]?.value?.slice(0, 80) ?? result.title
    if (freshIndex !== undefined) consumed.add(freshIndex)
    reconciled.set(oldIndex, result.fields.length ? result : null)
  }

  const output = [...current.filter((_, index) => !consumed.has(index)).map(item => pruneRetracted(item, withdrawn, available)), ...reconciled.values()].filter(item => item && array(item.fields).length)
  const required = new Set(output.flatMap(item => refs(item).map(refKey)))
  // Fresh sources remain available for unmapped-row review; old sources are
  // limited to references that are still active in this result.
  const retainedSources = [...available.values()].filter(source => array(sources).some(currentSource => key(currentSource) === key(source)) || required.has(key(source)))
  return { items: output, sources: retainedSources }
}
