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

export type HealthProfileViewStatus = 'all' | 'filled' | 'empty'

export interface PersonalizedDirectoryItem extends HealthProfileCatalogItem {
  activeFor: readonly string[]
  title: string
  description: string
  fields: ReadonlyArray<{ label: string }>
}

export function buildPersonalizedHealthDirectory<T extends PersonalizedDirectoryItem>(
  catalog: readonly T[],
  profileType: string,
  priorityOrder: readonly string[],
  recordedIds: ReadonlySet<string>,
  query = '',
  status: HealthProfileViewStatus = 'all',
  priorityLimit = 6
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const intentionallyHiddenWhenEmpty = new Set(['diet', 'smoking', 'alcohol'])
  const visible = catalog.filter((section) => (
    recordedIds.has(section.id)
    || (section.activeFor.includes(profileType) && !intentionallyHiddenWhenEmpty.has(section.id))
  )).filter((section) => {
    const filled = recordedIds.has(section.id)
    if (status === 'filled' && !filled) return false
    if (status === 'empty' && filled) return false
    if (!normalizedQuery) return true
    const searchable = [section.title, section.description, ...section.fields.map(({ label }) => label)].join(' ').toLocaleLowerCase()
    return searchable.includes(normalizedQuery)
  })

  const byId = new Map(visible.map((section) => [section.id, section]))
  const priority = priorityOrder.flatMap((id) => byId.get(id) ?? []).slice(0, priorityLimit)
  const priorityIds = new Set(priority.map(({ id }) => id))
  const remaining = visible.filter(({ id }) => !priorityIds.has(id))
  return { priority, remaining, visible }
}
