import { readAllergyItems, type AllergyHistoryItem } from '../../features/health-profile/utils/allergyProfile'

export type DietaryCardGroup = 'avoid' | 'temporary'
export type DietaryCardLanguage = 'zh' | 'en-zh'

export interface DietaryCardItem {
  id: string
  sourceId?: string
  foodId?: string
  name: string
  group: DietaryCardGroup
  visible: boolean
  manuallyAdded: boolean
  nameAdjusted: boolean
  groupAdjusted: boolean
  sourceName?: string
  sourceGroup?: DietaryCardGroup
  needsReview?: boolean
}

export interface DietaryCardSnapshot {
  version: 1
  memberId: string
  items: DietaryCardItem[]
  avoidCrossContact: boolean
  savedAt: string
  syncedAt: string
}

export interface DietaryCardPresentation {
  avoid: DietaryCardItem[]
  temporary: DietaryCardItem[]
  visibleCount: number
  missingTranslations: string[]
}

const ignoredFoodNames = new Set(['尚未明确', '过敏原未明', '不明确', '未知'])
const foodIds: Record<string, string> = {
  牛奶: 'milk', 鸡蛋: 'egg', 花生: 'peanut', 坚果: 'tree-nuts', 核桃: 'walnut', 杏仁: 'almond', 腰果: 'cashew',
  小麦: 'wheat', 大豆: 'soy', 豆类: 'soy', 芝麻: 'sesame', 鱼: 'fish', 鱼类: 'fish', 甲壳类: 'shellfish', 虾: 'shrimp', 蟹: 'crab',
  芒果: 'mango', 猕猴桃: 'kiwi', 草莓: 'strawberry', 桃: 'peach', 番茄: 'tomato', 燕麦: 'oat'
}

export const foodTranslations: Record<string, string> = {
  milk: 'Milk', egg: 'Egg', peanut: 'Peanut', 'tree-nuts': 'Tree nuts', walnut: 'Walnut', almond: 'Almond', cashew: 'Cashew',
  wheat: 'Wheat', soy: 'Soy', sesame: 'Sesame', fish: 'Fish', shellfish: 'Shellfish', shrimp: 'Shrimp', crab: 'Crab',
  mango: 'Mango', kiwi: 'Kiwifruit', strawberry: 'Strawberry', peach: 'Peach', tomato: 'Tomato', oat: 'Oats'
}

export const dietaryCopy = {
  zh: {
    title: '用餐忌口提示', intro: '请勿使用以下食物及含其成分的配料。', avoid: '明确不能吃', temporary: '暂时请避开', pending: '尚待确认',
    crossContact: '请避免共用锅具、餐具接触。', thanks: '如果无法确认配料，请先告诉我。谢谢！'
  },
  'en-zh': {
    title: 'Food Restrictions / 用餐忌口提示', intro: 'Please avoid the foods below and ingredients containing them. / 请勿使用以下食物及含其成分的配料。',
    avoid: 'Must avoid / 明确不能吃', temporary: 'Please avoid for now / 暂时请避开', pending: 'Pending confirmation / 尚待确认',
    crossContact: 'Please avoid shared cookware and utensil contact. / 请避免共用锅具、餐具接触。',
    thanks: 'If ingredients are uncertain, please tell me first. Thank you! / 如果无法确认配料，请先告诉我。谢谢！'
  }
} as const

export function normalizeFoodName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function foodIdFor(name: string) {
  return foodIds[normalizeFoodName(name)]
}

export function translateFood(item: Pick<DietaryCardItem, 'foodId' | 'name'>, language: DietaryCardLanguage) {
  if (language === 'zh') return item.name
  const translation = item.foodId ? foodTranslations[item.foodId] : undefined
  return translation ? `${translation} / ${item.name}` : `${item.name}（英文待补充）`
}

function sourceGroup(item: AllergyHistoryItem): DietaryCardGroup | null {
  if (item.category !== 'food' || ignoredFoodNames.has(normalizeFoodName(item.name))) return null
  if (item.currentStatus === 'excluded' || item.currentStatus === 'tolerated') return null
  if (item.currentStatus === 'confirmed') return 'avoid'
  if (item.currentStatus === 'suspected' || item.currentStatus === 'investigating' || item.reactions.length > 0) return 'temporary'
  return null
}

export function deriveDietarySources(allergyStorageValue: string, memberId: string, accountId = ''): DietaryCardItem[] {
  const seen = new Set<string>()
  return readAllergyItems(allergyStorageValue, memberId, accountId).flatMap((source) => {
    const group = sourceGroup(source)
    const name = normalizeFoodName(source.name)
    if (!group || !name) return []
    const foodId = foodIdFor(name)
    const key = foodId ?? name.toLocaleLowerCase('zh-CN')
    if (seen.has(key)) return []
    seen.add(key)
    return [{
      id: `source:${source.id}`, sourceId: source.id, ...(foodId ? { foodId } : {}), name, group, visible: true,
      manuallyAdded: false, nameAdjusted: false, groupAdjusted: false, sourceName: name, sourceGroup: group
    } satisfies DietaryCardItem]
  })
}

export function emptyDietarySnapshot(memberId: string, at = new Date().toISOString()): DietaryCardSnapshot {
  return { version: 1, memberId, items: [], avoidCrossContact: false, savedAt: at, syncedAt: at }
}

export function snapshotFromSources(memberId: string, sources: DietaryCardItem[], at = new Date().toISOString()): DietaryCardSnapshot {
  return { ...emptyDietarySnapshot(memberId, at), items: sources.map((item) => ({ ...item })) }
}

export function readDietarySnapshot(storageValue: string, memberId: string): DietaryCardSnapshot | null {
  try {
    const records = JSON.parse(storageValue) as unknown
    if (!Array.isArray(records)) return null
    const raw = records.find((entry) => entry && typeof entry === 'object' && (entry as { memberId?: unknown }).memberId === memberId) as Partial<DietaryCardSnapshot> | undefined
    if (!raw || raw.version !== 1 || !Array.isArray(raw.items)) return null
    const items = raw.items.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const value = entry as Partial<DietaryCardItem>
      const name = normalizeFoodName(String(value.name ?? ''))
      if (!name || !['avoid', 'temporary'].includes(String(value.group))) return []
      return [{
        id: String(value.id ?? `manual:${cryptoSafeId()}`), ...(value.sourceId ? { sourceId: String(value.sourceId) } : {}),
        ...(value.foodId ? { foodId: String(value.foodId) } : foodIdFor(name) ? { foodId: foodIdFor(name) } : {}),
        name, group: value.group as DietaryCardGroup, visible: value.visible !== false, manuallyAdded: Boolean(value.manuallyAdded),
        nameAdjusted: Boolean(value.nameAdjusted), groupAdjusted: Boolean(value.groupAdjusted),
        ...(value.sourceName ? { sourceName: String(value.sourceName) } : {}),
        ...(value.sourceGroup && ['avoid', 'temporary'].includes(value.sourceGroup) ? { sourceGroup: value.sourceGroup } : {}),
        ...(value.needsReview ? { needsReview: true } : {})
      } satisfies DietaryCardItem]
    })
    return {
      version: 1, memberId, items, avoidCrossContact: Boolean(raw.avoidCrossContact),
      savedAt: String(raw.savedAt ?? new Date().toISOString()), syncedAt: String(raw.syncedAt ?? raw.savedAt ?? new Date().toISOString())
    }
  } catch { return null }
}

export function mergeDietarySources(snapshot: DietaryCardSnapshot, sources: DietaryCardItem[], at = new Date().toISOString()) {
  const sourcesById = new Map(sources.filter((item) => item.sourceId).map((item) => [item.sourceId!, item]))
  const merged: DietaryCardItem[] = snapshot.items.flatMap((item): DietaryCardItem[] => {
    if (!item.sourceId) return [{ ...item, needsReview: false }]
    const source = sourcesById.get(item.sourceId)
    if (!source) {
      if (item.manuallyAdded || item.nameAdjusted || item.groupAdjusted || !item.visible) return [{ ...item, needsReview: true }]
      return []
    }
    sourcesById.delete(item.sourceId)
    return [{
      ...item,
      name: item.nameAdjusted ? item.name : source.name,
      group: item.groupAdjusted ? item.group : source.group,
      foodId: item.nameAdjusted ? foodIdFor(item.name) : source.foodId,
      sourceName: source.name,
      sourceGroup: source.group,
      needsReview: false
    }]
  })
  const known = new Set(merged.map((item) => item.foodId ?? normalizeFoodName(item.name).toLocaleLowerCase('zh-CN')))
  for (const source of sourcesById.values()) {
    const key = source.foodId ?? normalizeFoodName(source.name).toLocaleLowerCase('zh-CN')
    if (!known.has(key)) { known.add(key); merged.push({ ...source }) }
  }
  return { ...snapshot, items: merged, syncedAt: at, savedAt: at }
}

export function createManualDietaryItem(name: string, group: DietaryCardGroup = 'temporary'): DietaryCardItem {
  const normalized = normalizeFoodName(name)
  const foodId = foodIdFor(normalized)
  return {
    id: `manual:${cryptoSafeId()}`, ...(foodId ? { foodId } : {}), name: normalized, group, visible: true,
    manuallyAdded: true, nameAdjusted: true, groupAdjusted: true
  }
}

export function dietaryItemExists(items: DietaryCardItem[], name: string, exceptId = '') {
  const normalized = normalizeFoodName(name).toLocaleLowerCase('zh-CN')
  const foodId = foodIdFor(name)
  return items.some((item) => item.id !== exceptId && (foodId ? item.foodId === foodId : normalizeFoodName(item.name).toLocaleLowerCase('zh-CN') === normalized))
}

export function presentDietaryCard(snapshot: DietaryCardSnapshot, language: DietaryCardLanguage): DietaryCardPresentation {
  const visible = snapshot.items.filter((item) => item.visible)
  return {
    avoid: visible.filter((item) => item.group === 'avoid'),
    temporary: visible.filter((item) => item.group === 'temporary'),
    visibleCount: visible.length,
    missingTranslations: language === 'en-zh' ? visible.filter((item) => !item.foodId || !foodTranslations[item.foodId]).map((item) => item.name) : []
  }
}

export function snapshotsEqual(a: DietaryCardSnapshot, b: DietaryCardSnapshot) {
  const comparable = (value: DietaryCardSnapshot) => ({ items: value.items, avoidCrossContact: value.avoidCrossContact })
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b))
}

function cryptoSafeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
