import dictionary from '../src/features/body-location/child-data/locations.json' with { type: 'json' }

const names = new Map(dictionary.regions.flatMap(region => region.items.map(item => [item.id, item.label])))
const ordinal = /\s*[·、，]?\s*\d+\s*号(?:区域|区|部位)?/g
/** Presentation only: original IDs, labels and coordinates are never migrated in place. */
export function bodyLocationLabel(location) {
  const snapshot = String(location.displayLabel || location.label || '').trim()
  ordinal.lastIndex = 0
  if (!ordinal.test(snapshot)) return snapshot || '位置待补充'
  ordinal.lastIndex = 0
  const reliable = names.get(location.id)
  if (reliable) return reliable
  const remaining = snapshot.replace(ordinal, '').trim()
  return remaining && !/^(位置|区域|部位|旧图)$/.test(remaining) ? remaining : `${snapshot}（位置待补充）`
}
