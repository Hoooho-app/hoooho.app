import type { VisitSheet, VisitSource } from '../../types/visitSheet'

// Report revisions, source numbering and collection times are not clinical changes.
const sourceContent = (source: VisitSource) => JSON.stringify([
  source.title, source.text, source.narrative, source.occurredAt,
  source.timePrecision, source.locations, source.relatedSourceIds,
])

export function sourceChanges(current: VisitSheet, candidate: VisitSheet) {
  const previous = new Map(current.sources.map(source => [source.id, source]))
  const next = new Set(candidate.sources.map(source => source.id))
  return {
    added: candidate.sources.filter(source => !previous.has(source.id)),
    changed: candidate.sources.filter(source => {
      const before = previous.get(source.id)
      return before && sourceContent(before) !== sourceContent(source)
    }),
    removed: current.sources.filter(source => !next.has(source.id)),
  }
}
