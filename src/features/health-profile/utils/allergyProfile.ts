export type AllergyCategory = 'food' | 'drug' | 'environment' | 'insect' | 'contact' | 'unknown'
export type AllergyStatus = 'suspected' | 'investigating' | 'confirmed' | 'excluded' | 'tolerated' | ''

export interface AllergyReactionRecord {
  id: string
  allergyItemId: string
  memberId: string
  linkedHealthEventId?: string
  symptomSystems: string[]
  symptoms: string
  exposureAmount: string
  latency: string
  bodyLocations: string
  handling: string
  aggravatingFactors: string
  relievingFactors: string
  occurredAt: string
  photos: string[]
  notes: string
}

export interface AllergyTestRecord {
  id: string
  allergyItemId: string
  memberId: string
  testType: string
  result: 'positive' | 'negative' | 'borderline' | ''
  value: string
  unit: string
  testedAt: string
  institution: string
  reportFiles: string[]
  clinicianInterpretation: string
  notes: string
}

export interface AllergyEvidenceLink {
  id: string
  allergyItemId: string
  healthEventId: string
  relationType: 'temporal' | 'keyword' | 'manual'
  confidence: number
  source: 'rule' | 'manual' | 'existing'
  confirmedByUser: boolean
  createdAt: string
}

export interface AllergyHistoryItem {
  id: string
  accountId: string
  memberId: string
  category: AllergyCategory
  name: string
  customName: string
  currentStatus: AllergyStatus
  statusUpdatedAt?: string
  excludedAt?: string
  toleranceSince?: string
  lastReactionAt?: string
  clinician?: string
  clinicianNote?: string
  createdAt: string
  updatedAt: string
  reactions: AllergyReactionRecord[]
  tests: AllergyTestRecord[]
  evidenceLinks: AllergyEvidenceLink[]
}

export interface AllergyArchive { version: 2; items: AllergyHistoryItem[] }

export const allergyCategoryLabels: Record<AllergyCategory, string> = {
  food: '食物', drug: '药物', environment: '环境', insect: '昆虫', contact: '接触物', unknown: '尚未明确'
}

export const allergyCategoryExamples: Record<AllergyCategory, string> = {
  food: '牛奶、鸡蛋、坚果等',
  drug: '抗生素、退热药等',
  environment: '尘螨、花粉、霉菌等',
  insect: '蜂、蚊虫等',
  contact: '乳胶、金属、洗护用品等',
  unknown: '暂时说不清具体对象'
}

export const allergyStatusLabels: Record<Exclude<AllergyStatus, ''>, string> = {
  suspected: '怀疑中', investigating: '正在排查', confirmed: '医生已确认', excluded: '已排除', tolerated: '曾经有，目前已耐受'
}

export const allergyOptions: Record<AllergyCategory, string[]> = {
  food: ['牛奶', '鸡蛋', '花生', '坚果', '小麦', '大豆', '鱼类', '甲壳类'],
  drug: ['青霉素类', '头孢类', '解热镇痛药', '疫苗', '造影剂', '麻醉药'],
  environment: ['尘螨', '花粉', '霉菌', '猫狗皮屑', '蟑螂', '粉尘'],
  insect: ['蜜蜂', '黄蜂', '蚊虫', '蚂蚁', '跳蚤', '其他昆虫'],
  contact: ['乳胶', '金属', '洗护用品', '消毒剂', '织物', '植物'],
  unknown: ['尚未明确']
}

export const allergyTestTypes = ['血清特异性 IgE', '皮肤点刺试验', '斑贴试验', '过敏原组分检测', '医疗监督下激发试验', '回避—再引入观察', '其他'] as const

const observationalTestTypes = new Set<string>(['回避—再引入观察', '其他'])
const now = () => new Date().toISOString()
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const isCategory = (value: unknown): value is AllergyCategory => Object.keys(allergyCategoryLabels).includes(String(value))
const optionalString = (value: unknown) => typeof value === 'string' && value ? value : undefined
type LegacyRecord = Record<string, unknown>

export function createAllergyItem(memberId: string, category: AllergyCategory, name: string, accountId = ''): AllergyHistoryItem {
  const timestamp = now()
  return {
    id: makeId('allergy'), accountId, memberId, category, name,
    customName: allergyOptions[category].includes(name) ? '' : name,
    currentStatus: '', createdAt: timestamp, updatedAt: timestamp,
    reactions: [], tests: [], evidenceLinks: []
  }
}

export function createUnknownAllergyItem(memberId: string, accountId = '') {
  return createAllergyItem(memberId, 'unknown', '尚未明确', accountId)
}

const legacyCategory = (value: string): AllergyCategory => value.includes('药') ? 'drug' : value.includes('环境') ? 'environment' : value.includes('虫') ? 'insect' : value.includes('接触') ? 'contact' : value.includes('食') ? 'food' : 'unknown'
const normalizeStatus = (value: string): AllergyStatus => {
  if (['suspected', 'investigating', 'confirmed', 'excluded', 'tolerated'].includes(value)) return value as AllergyStatus
  return value.includes('医生') ? 'confirmed' : value.includes('排查') ? 'investigating' : value.includes('排除') ? 'excluded' : value.includes('耐受') ? 'tolerated' : value.includes('怀疑') ? 'suspected' : ''
}

function normalizeReaction(value: unknown, itemId: string, memberId: string): AllergyReactionRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as LegacyRecord
  return {
    id: String(record.id ?? makeId('reaction')),
    allergyItemId: String(record.allergyItemId ?? itemId), memberId,
    linkedHealthEventId: optionalString(record.linkedHealthEventId),
    symptomSystems: Array.isArray(record.symptomSystems) ? record.symptomSystems.map(String) : [],
    symptoms: String(record.symptoms ?? ''), exposureAmount: String(record.exposureAmount ?? ''),
    latency: String(record.latency ?? ''), bodyLocations: String(record.bodyLocations ?? ''),
    handling: String(record.handling ?? ''), aggravatingFactors: String(record.aggravatingFactors ?? ''),
    relievingFactors: String(record.relievingFactors ?? ''), occurredAt: String(record.occurredAt ?? now()),
    photos: Array.isArray(record.photos) ? record.photos.map(String) : [], notes: String(record.notes ?? '')
  }
}

function normalizeTest(value: unknown, itemId: string, memberId: string): AllergyTestRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as LegacyRecord
  const result = ['positive', 'negative', 'borderline'].includes(String(record.result)) ? record.result as AllergyTestRecord['result'] : ''
  return {
    id: String(record.id ?? makeId('test')), allergyItemId: String(record.allergyItemId ?? itemId), memberId,
    testType: String(record.testType ?? ''), result, value: String(record.value ?? ''), unit: String(record.unit ?? ''),
    testedAt: String(record.testedAt ?? ''), institution: String(record.institution ?? ''),
    reportFiles: Array.isArray(record.reportFiles) ? record.reportFiles.map(String) : [],
    clinicianInterpretation: String(record.clinicianInterpretation ?? ''), notes: String(record.notes ?? '')
  }
}

export function normalizeAllergyArchive(value: unknown, memberId: string, accountId = ''): AllergyArchive {
  const raw = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { items?: unknown[] }).items) ? (value as { items: unknown[] }).items : []
  const items = raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as LegacyRecord
    const name = String(item.name ?? item.subject ?? '').trim()
    if (!name) return []
    const category = isCategory(item.category) ? item.category : legacyCategory(String(item.type ?? ''))
    const timestamp = String(item.updatedAt ?? item._savedAt ?? item.createdAt ?? now())
    const id = String(item.id ?? `legacy-allergy-${index + 1}`)
    const ownerMemberId = String(item.memberId ?? memberId)
    return [{
      // Profile sections are already scoped to the authenticated account by the server.
      // Canonicalize legacy records because older clients accidentally stored the session token here.
      id, accountId: accountId || String(item.accountId ?? ''), memberId: ownerMemberId, category, name,
      customName: String(item.customName ?? ''), currentStatus: normalizeStatus(String(item.currentStatus ?? item.certainty ?? '')),
      statusUpdatedAt: optionalString(item.statusUpdatedAt), excludedAt: optionalString(item.excludedAt),
      toleranceSince: optionalString(item.toleranceSince), lastReactionAt: optionalString(item.lastReactionAt),
      clinician: String(item.clinician ?? ''), clinicianNote: String(item.clinicianNote ?? ''),
      createdAt: String(item.createdAt ?? timestamp), updatedAt: timestamp,
      reactions: Array.isArray(item.reactions) ? item.reactions.map(record => normalizeReaction(record, id, ownerMemberId)).filter((record): record is AllergyReactionRecord => Boolean(record)) : [],
      tests: Array.isArray(item.tests) ? item.tests.map(record => normalizeTest(record, id, ownerMemberId)).filter((record): record is AllergyTestRecord => Boolean(record)) : [],
      evidenceLinks: Array.isArray(item.evidenceLinks) ? item.evidenceLinks as AllergyEvidenceLink[] : []
    } satisfies AllergyHistoryItem]
  })
  return { version: 2, items }
}

export function readAllergyItems(storageValue: string, memberId: string, accountId = '') {
  try {
    return normalizeAllergyArchive(JSON.parse(storageValue), memberId, accountId).items.filter(item => item.memberId === memberId && (!accountId || item.accountId === accountId))
  } catch { return [] }
}

export function appendUniqueAllergyItems(items: AllergyHistoryItem[], additions: AllergyHistoryItem[]) {
  const keys = new Set(items.filter(item => item.category !== 'unknown').map(item => `${item.category}:${item.name.trim().toLocaleLowerCase()}`))
  return [...items, ...additions.filter(item => {
    if (item.category === 'unknown') return true
    const key = `${item.category}:${item.name.trim().toLocaleLowerCase()}`
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })]
}

export function allergyReactionSummary(record: AllergyReactionRecord) {
  return record.symptoms.trim() || record.symptomSystems.join('、') || '具体表现未补充'
}

export function allergyTestResultLabel(result: AllergyTestRecord['result']) {
  return ({ positive: '阳性', negative: '阴性', borderline: '临界', '': '结果未填写' } as const)[result]
}

export function testSupportsStructuredResult(testType: string) { return Boolean(testType) && !observationalTestTypes.has(testType) }
export function testSupportsNumericValue(testType: string) { return ['血清特异性 IgE', '过敏原组分检测'].includes(testType) }

export function formatAllergyDate(value: string) {
  if (!value) return '时间未填写'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatElapsedSince(value?: string, reference = new Date()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const days = Math.max(0, Math.floor((reference.getTime() - date.getTime()) / 86400000))
  if (days < 31) return `${days}天`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}个月`
  return `${Math.floor(months / 12)}年${months % 12 ? `${months % 12}个月` : ''}`
}

export function buildTemporalStatement(_itemName: string, exposureTitle: string, symptomTitle: string, latency = '') {
  return `${exposureTitle}${latency ? `后约${latency}` : '后'}记录到${symptomTitle}`
}

// Compatibility exports for existing readers and migrations.
export type AllergyProfileRecord = AllergyHistoryItem
export function emptyAllergyRecord(sequence: number) { return createAllergyItem('', 'unknown', `过敏 / 反应 ${sequence}`) }
export function nextAllergySequence(records: readonly unknown[]) { return records.length + 1 }
export interface AllergyReport { id: string; name: string; date: string; dataUrl: string; mimeType: string; parsingStatus: '待人工整理' }
export function normalizeAllergyRecords(records: readonly LegacyRecord[], memberId = '') { return normalizeAllergyArchive(records, memberId).items.filter(item => !memberId || item.memberId === memberId) }
export function normalizeAllergyReports(value: unknown): AllergyReport[] { return Array.isArray(value) ? value.flatMap(item => item && typeof item === 'object' && 'id' in item && 'name' in item && 'dataUrl' in item ? [{ ...(item as AllergyReport), parsingStatus: '待人工整理' as const }] : []) : [] }
