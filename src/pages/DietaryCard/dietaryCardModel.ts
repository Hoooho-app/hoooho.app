import { readAllergyItems, type AllergyHistoryItem } from '../../features/health-profile/utils/allergyProfile'

export type DietaryCardGroup = 'avoid' | 'temporary'
export type DietaryCardNativeLanguage = 'zh' | 'zh-Hant' | 'en'
export type DietaryCardLanguage = DietaryCardNativeLanguage | 'en-zh' | 'en-zh-Hant'

// An explicit account choice takes precedence over the device language/region.
export function resolveDietaryNativeLanguage(accountLanguage?: string, deviceLanguage = 'zh-CN'): DietaryCardNativeLanguage {
  const locale = (accountLanguage || deviceLanguage).replace(/_/g, '-').toLowerCase()
  if (/^en(?:-|$)/.test(locale)) return 'en'
  if (/^zh(?:-|$)/.test(locale) && !locale.includes('-hans') && /-(?:hant|tw|hk|mo)(?:-|$)/.test(locale)) return 'zh-Hant'
  return 'zh'
}

export function dietaryLanguageOptions(native: DietaryCardNativeLanguage) {
  if (native === 'en') return [{ value: 'en', label: 'English' }] as const
  return native === 'zh-Hant'
    ? [{ value: 'zh-Hant', label: '繁體中文' }, { value: 'en', label: 'English' }, { value: 'en-zh-Hant', label: '繁體中文 + English' }] as const
    : [{ value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }, { value: 'en-zh', label: '简体中文 + English' }] as const
}

export function defaultDietaryLanguage(native: DietaryCardNativeLanguage): DietaryCardLanguage {
  return native === 'en' ? 'en' : native === 'zh-Hant' ? 'en-zh-Hant' : 'en-zh'
}

export interface DietaryCardItem {
  id: string
  sourceId?: string
  foodId?: string
  name: string
  englishName?: string
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
  小麦: 'wheat', 大豆: 'soy', 芝麻: 'sesame', 鱼: 'fish', 鱼类: 'fish', 甲壳类: 'shellfish', 虾: 'shrimp', 蟹: 'crab',
  芒果: 'mango', 猕猴桃: 'kiwi', 草莓: 'strawberry', 桃: 'peach', 番茄: 'tomato', 燕麦: 'oat', 鳕鱼: 'cod', 羊肉: 'lamb-mutton', 火龙果: 'dragon-fruit'
}

export const foodTranslations: Record<string, string> = {
  milk: 'Milk', egg: 'Egg', peanut: 'Peanut', 'tree-nuts': 'Tree nuts', walnut: 'Walnut', almond: 'Almond', cashew: 'Cashew',
  wheat: 'Wheat', soy: 'Soy', sesame: 'Sesame', fish: 'Fish', shellfish: 'Shellfish', shrimp: 'Shrimp', crab: 'Crab',
  mango: 'Mango', kiwi: 'Kiwifruit', strawberry: 'Strawberry', peach: 'Peach', tomato: 'Tomato', oat: 'Oats', cod: 'Cod', 'lamb-mutton': 'Lamb / Mutton', 'dragon-fruit': 'Dragon fruit'
}

const traditionalFoodNames: Record<string, string> = {
  鸡蛋: '雞蛋', 坚果: '堅果', 核桃: '核桃', 豆类: '豆類', 鱼: '魚', 鱼类: '魚類', 甲壳类: '甲殼類', 虾: '蝦',
  猕猴桃: '奇異果', 番茄: '番茄', 燕麦: '燕麥'
}
const simplifiedFoodNames = Object.fromEntries(Object.entries(traditionalFoodNames).map(([simplified, traditional]) => [traditional, simplified]))

const englishCopy = {
  title: 'Food Restrictions', intro: 'Please avoid the foods below and ingredients containing them.',
  avoid: 'Must avoid', temporary: 'Please avoid for now', pending: 'Pending confirmation',
  crossContact: 'Please avoid shared cookware and utensil contact.',
  thanks: 'If ingredients are uncertain, please tell me first. Thank you!'
}
const traditionalCopy = {
  title: '用餐忌口提示', intro: '請勿使用以下食物及含其成分的配料。', avoid: '明確不能吃', temporary: '暫時請避開', pending: '尚待確認',
  crossContact: '請避免共用鍋具、餐具接觸。', thanks: '如果無法確認配料，請先告訴我。謝謝！'
}

function bilingualCopy(native: typeof traditionalCopy) {
  return Object.fromEntries(Object.entries(englishCopy).map(([key, value]) => [key, `${value} / ${native[key as keyof typeof native]}`])) as typeof traditionalCopy
}

export const dietaryCopy = {
  en: englishCopy,
  'zh-Hant': traditionalCopy,
  'en-zh-Hant': bilingualCopy(traditionalCopy),
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
  const normalized = normalizeFoodName(name)
  return foodIds[simplifiedFoodNames[normalized] ?? normalized]
}

function englishFoodName(item: Pick<DietaryCardItem, 'foodId' | 'name' | 'englishName'>) {
  const id = item.foodId ?? foodIdFor(item.name)
  const manual = item.englishName?.trim()
  return manual && !/\p{Script=Han}/u.test(manual) ? manual : (id ? foodTranslations[id] : undefined)
}

export function translateFood(item: Pick<DietaryCardItem, 'foodId' | 'name' | 'englishName'>, language: DietaryCardLanguage) {
  const simplifiedName = simplifiedFoodNames[item.name] ?? item.name
  const nativeName = language.includes('Hant') ? traditionalFoodNames[simplifiedName] ?? item.name : simplifiedName
  if (language === 'zh' || language === 'zh-Hant') return nativeName
  const translation = englishFoodName(item)
  if (language === 'en') {
    if (!translation) throw new Error('请先补充所有食物的英文名称')
    return translation
  }
  return translation ? `${translation} / ${nativeName}` : `${nativeName}${language.includes('Hant') ? '（英文待補充）' : '（英文待补充）'}`
}

function sourceGroup(item: AllergyHistoryItem): DietaryCardGroup | null {
  if (item.category !== 'food' || ignoredFoodNames.has(normalizeFoodName(item.name))) return null
  if (item.currentStatus === 'excluded' || item.currentStatus === 'tolerated') return null
  if (item.currentStatus === 'confirmed') return 'avoid'
  if (item.dietaryAction === 'temporary') return 'temporary'
  if (item.dietaryAction === 'avoid') return 'avoid'
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
        name, ...(value.englishName ? {englishName:String(value.englishName).slice(0,80)} : {}), group: value.group as DietaryCardGroup, visible: value.visible !== false, manuallyAdded: Boolean(value.manuallyAdded),
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
    if (!source) return []
    sourcesById.delete(item.sourceId)
    return [{
      ...item,
      name: source.name,
      group: source.group,
      foodId: source.foodId,
      nameAdjusted: false,
      groupAdjusted: false,
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
    missingTranslations: language === 'zh' || language === 'zh-Hant' ? [] : visible.filter((item) => !englishFoodName(item)).map((item) => item.name)
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
