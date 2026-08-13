export interface HealthProfileCatalogItem { id: string }
export interface StoredHealthProfileItem { id: string; updatedAt: string }

export function buildHealthProfileHomeGroups<T extends HealthProfileCatalogItem>(
  catalog: readonly T[],
  suggestionOrder: readonly string[],
  stored: readonly StoredHealthProfileItem[],
  suggestedLimit = 8
) {
  const byId = new Map(catalog.map((section) => [section.id, section]))
  const recordedIds = new Set(stored.map(({ id }) => id))
  const recorded = [...stored]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .flatMap(({ id }) => byId.get(id) ?? [])
  const suggested = suggestionOrder
    .filter((id) => !recordedIds.has(id))
    .flatMap((id) => byId.get(id) ?? [])
    .slice(0, suggestedLimit)
  return { recorded, suggested, all: [...catalog] }
}

export function latestStoredSections(
  sectionIds: readonly string[],
  memberId: string,
  storage: { getItem(key: string): string | null }
) {
  return sectionIds.flatMap((id) => {
    try {
      const records = JSON.parse(storage.getItem(`hoho-health-profile:${memberId}:${id}`) ?? '[]')
      if (!Array.isArray(records) || !records.length) return []
      const updatedAt = records.reduce((latest: string, record: Record<string, unknown>) => {
        const value = typeof record?._savedAt === 'string' ? record._savedAt : ''
        return value > latest ? value : latest
      }, '')
      return [{ id, updatedAt }]
    } catch { return [] }
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}
