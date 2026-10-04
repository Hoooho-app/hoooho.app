// Read-only presentation projection. Never changes original records or diagnoses.
export const knownOccurrence = record => !record.caseContext?.timeUnknown && record.journal?.timePrecision !== 'unknown' && Number.isFinite(Date.parse(record.occurredAt))
export function caseFollowupView(event, records) {
  const known = records.filter(knownOccurrence).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const symptom = [...records].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).find(r => r.journal?.symptom) ?? records.find(r => r.type === 'symptom')
  const details = symptom?.journal?.symptom
  const raw = details?.generatedSummary || details?.keywords?.join('、') || event.title || symptom?.content || ''
  // Only remove conversational filler and select an existing clause, not infer facts.
  const clauses = raw.replace(/^(?:其实|就是|然后|早上起来的时候就开始|早上起来的时候|我想记录一下|记录一下)+/u, '').split(/[，。；\n]/u).filter(Boolean)
  const source = details?.generatedSummary || details?.keywords?.length ? raw : clauses.find(s => /头晕|头痛|头疼|发热|发烧|咳嗽|鼻塞|发红|红肿|瘙痒|发痒|呕吐|腹泻|疼痛|呼吸|皮疹|不舒服/u.test(s)) || clauses[0] || raw
  const title = source.length > 48 ? `${source.slice(0,48)}…` : source || '情况记录'
  const supplement = details?.shortNote?.trim() || symptom?.caseContext?.supplement?.trim() || ''
  return { title, supplement: supplement && !raw.includes(supplement) && !supplement.includes(title.replace(/…$/, '')) ? supplement : null, recordCount: records.length, firstOccurredAt: known[0]?.occurredAt ?? null, latestOccurredAt: known.at(-1)?.occurredAt ?? null, hasUnknownTime: known.length < records.length }
}
