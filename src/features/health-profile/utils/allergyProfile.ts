export interface AllergyProfileRecord {
  id: string
  sequence: number
  certainty: string
  type: string
  subject: string
  reactions: string[]
  reactionDetail: string
  otherReaction: string
  impact: string
  handling: string
  _savedAt?: string
}

export interface AllergyReport {
  id: string
  name: string
  date: string
  dataUrl: string
  mimeType: string
  parsingStatus: '待人工整理'
}

type StoredAllergyRecord = Partial<AllergyProfileRecord> & {
  name?: unknown
  reaction?: unknown
  [key: string]: unknown
}

export function emptyAllergyRecord(sequence: number): AllergyProfileRecord {
  return {
    id: `allergy-${Date.now()}-${sequence}`,
    sequence,
    certainty: '',
    type: '',
    subject: '',
    reactions: [],
    reactionDetail: '',
    otherReaction: '',
    impact: '',
    handling: ''
  }
}

const reactionCategoryByDetail: Record<string, string> = {
  皮疹: '皮肤', 荨麻疹: '皮肤', 瘙痒: '皮肤', 红肿: '皮肤', 其他皮肤表现: '皮肤',
  腹痛: '消化道', '腹泻 / 排便异常': '消化道', 呕吐: '消化道', '便血 / 黏液便': '消化道', 肛周发红: '消化道', 其他消化道表现: '消化道',
  打喷嚏: '呼吸道', 流鼻涕: '呼吸道', 鼻塞: '呼吸道', '眼睛痒 / 红 / 流泪': '呼吸道', 咳嗽: '呼吸道', 喘息: '呼吸道', 呼吸不适: '呼吸道',
  明显肿胀: '全身', '头晕 / 乏力': '全身', 严重全身反应: '全身'
}

const reactionCategories = new Set(['皮肤', '消化道', '呼吸道', '全身'])

export function normalizeAllergyRecords(records: readonly StoredAllergyRecord[]): AllergyProfileRecord[] {
  return records.map((record, index) => {
    const storedReactions = Array.isArray(record.reactions) ? record.reactions.map(String) : []
    const categories = [...new Set(storedReactions.map((reaction) => reactionCategories.has(reaction) ? reaction : reactionCategoryByDetail[reaction]).filter(Boolean))]
    const legacyDetails = storedReactions.filter((reaction) => !reactionCategories.has(reaction))
    return ({
    id: typeof record.id === 'string' && record.id ? record.id : `legacy-allergy-${index + 1}`,
    sequence: typeof record.sequence === 'number' && record.sequence > 0 ? record.sequence : index + 1,
    certainty: String(record.certainty ?? '已明确'),
    type: String(record.type ?? ''),
    subject: String(record.subject ?? record.name ?? ''),
    reactions: categories,
    reactionDetail: String(record.reactionDetail ?? legacyDetails.join('、')),
    otherReaction: String(record.otherReaction ?? record.reaction ?? ''),
    impact: String(record.impact ?? ''),
    handling: String(record.handling ?? ''),
    _savedAt: typeof record._savedAt === 'string' ? record._savedAt : undefined
    })
  }).sort((left, right) => left.sequence - right.sequence)
}

export function nextAllergySequence(records: readonly AllergyProfileRecord[]) {
  return records.reduce((maximum, record) => Math.max(maximum, record.sequence), 0) + 1
}

export function allergyReactionSummary(record: AllergyProfileRecord) {
  const reactions = record.reactions.filter(Boolean)
  if (reactions.length) return reactions.join(' / ')
  return [record.reactionDetail, record.otherReaction].filter(Boolean).join('、')
}

export function normalizeAllergyReports(value: unknown): AllergyReport[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const report = item as Partial<AllergyReport>
    if (!report.id || !report.name || !report.dataUrl) return []
    return [{
      id: String(report.id),
      name: String(report.name),
      date: String(report.date ?? ''),
      dataUrl: String(report.dataUrl),
      mimeType: String(report.mimeType ?? ''),
      parsingStatus: '待人工整理' as const
    }]
  })
}
