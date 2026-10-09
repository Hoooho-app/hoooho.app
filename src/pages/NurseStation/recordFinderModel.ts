import { journalSearchAlternatives, journalSearchFields, journalSearchResultSummary, normalizeJournalSearch, searchJournalEntries, type JournalEntry } from '../HealthEvents/timeViewModel'
export interface FinderPlan { question: string; terms: string[][]; relatedTerms: string[]; filters: string[][]; excludes: string[]; from: number | null; to: number | null; first: boolean; changes: boolean; newFood: boolean; category?: string }
export interface FinderMatch { entry: JournalEntry; evidence: string; related: boolean; reason?: string }
// Ordinary lookup uses the journal magnifier's existing matcher. The extended
// earliest/new-food/matter queries keep their evidence and uncertainty rules.
export function lookupRecords(entries: readonly JournalEntry[], question: string, now = new Date()): FinderMatch[] {
  if (!question.trim()) return []
  const sources = entries.map(entry => ({ ...entry, aiNurse: undefined }))
  const query = question.replace(/^(只看|只查|仅看|仅查|再看)/, '').replace(/上的/g, '')
  const plan = finderPlan(query, undefined, now)
  if (plan.first || plan.changes || plan.newFood || /(?:最近|近)[一两二三四五六七八九十\d]+个?(?:月|天|周)|前天/.test(question)) return findRecords(sources, plan)
  const classified = new Map(findRecords(sources, plan).map(match => [match.entry.id, match]))
  return searchJournalEntries(sources, query, now).map(entry => classified.get(entry.id) ?? {
    entry,
    evidence: journalSearchResultSummary(entry, query),
    related: entry.timePrecision === 'unknown',
    reason: entry.timePrecision === 'unknown' ? '发生时间未明确，请核对原文' : undefined,
  })
}

export function orderLookupMatches(matches: readonly FinderMatch[], order: 'recent' | 'earliest'): FinderMatch[] {
  return [...matches].sort((a, b) => {
    const aUnknown = a.entry.timePrecision === 'unknown' || !Number.isFinite(Date.parse(a.entry.occurredAt))
    const bUnknown = b.entry.timePrecision === 'unknown' || !Number.isFinite(Date.parse(b.entry.occurredAt))
    if (aUnknown !== bUnknown) return Number(aUnknown) - Number(bUnknown)
    const comparison = (aUnknown ? 0 : Date.parse(b.entry.occurredAt) - Date.parse(a.entry.occurredAt)) || b.entry.createdAt.localeCompare(a.entry.createdAt) || b.entry.id.localeCompare(a.entry.id)
    return order === 'earliest' && !aUnknown ? -comparison : comparison
  })
}
const concepts = [
  { words: ['红屁股', '红屁屁'], related: ['尿布疹', '臀部发红', '屁股红', '肛周发红'] },
  { words: ['红疹', '皮疹', '疹子'], related: ['痘痘', '红点', '小疙瘩', '湿疹'] },
  { words: ['发烧', '发热'], related: ['体温'] },
  { words: ['呕吐', '吐了'], related: ['溢奶', '吐奶'] },
]
const locations: Record<string, string[]> = { 屁股: ['屁股', '臀部', '肛周', '屁屁'], 脸: ['脸', '面部', '脸颊'], 手: ['手'], 脚: ['脚', '足'] }
const number = (v: string) => ({ 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }[v] ?? Number(v))
function words(text: string) {
  const concept = concepts.find(c => c.words.some(w => text.includes(w)))
  const location = Object.keys(locations).find(word => text.includes(word))
  if (concept) return { terms: [concept.words, ...(location ? [locations[location]] : [])], relatedTerms: concept.related }
  const related = concepts.find(c => c.related.some(w => text.includes(w)))
  if (related) return { terms: [[related.related.find(w => text.includes(w))!]], relatedTerms: [...related.words, ...related.related.filter(w => !text.includes(w))] }
  const clean = text.replace(/第一次|最早|最近一次|后来|有什么变化|变化|最近|这次|那次|帮我|宝宝|孩子|最近一次|上次|请|查找|查一下|查|搜索|记录|随记|有没有|是否|什么时候|是什么|什么|时候|吃过什么|用过什么|出现过|出现|发生过|发生|吃过|吃了|吃|喝过|喝了|喝|的|了|吗|呢|在|过/g, ' ').replace(/[？?，,。]/g, ' ')
  return { terms: clean.split(/\s+/).filter(Boolean).map(journalSearchAlternatives), relatedTerms: [] as string[] }
}
export function finderPlan(question: string, previous?: FinderPlan, now = new Date()): FinderPlan {
  const refine = !!previous && /^(只看|只查|仅看|仅查|排除|不要|不含|再看)/.test(question.trim())
  if (refine) {
    const location = Object.keys(locations).find(w => question.includes(w))
    const term = question.replace(/^(只看|只查|仅看|仅查|排除|不要|不含|再看)/, '').replace(/上的|的/g, '').trim()
    return { ...previous, question: `${previous.question}；${question}`, filters: /^(排除|不要|不含)/.test(question) ? previous.filters : [...previous.filters, location ? locations[location] : [term]], excludes: /^(排除|不要|不含)/.test(question) ? [...previous.excludes, term] : previous.excludes }
  }
  let raw = question, from: number | null = null, to: number | null = null
  if (/上个?月/.test(raw)) {
    const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(1)
    const start = new Date(end); start.setMonth(start.getMonth() - 1)
    from = start.getTime(); to = end.getTime() - 1; raw = raw.replace(/上个?月/g, '')
  } else if (/上周|上星期/.test(raw)) {
    const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - (end.getDay() + 6) % 7)
    const start = new Date(end); start.setDate(start.getDate() - 7)
    from = start.getTime(); to = end.getTime() - 1; raw = raw.replace(/上周|上星期/g, '')
  }
  const range = raw.match(/(?:最近|近)([一两二三四五六七八九十\d]+)个?(月|天|周)/)
  if (range) { const start = new Date(now); const n = number(range[1]); if (range[2] === '月') start.setMonth(start.getMonth() - n); else start.setDate(start.getDate() - n * (range[2] === '周' ? 7 : 1)); from = start.getTime(); to = now.getTime(); raw = raw.replace(range[0], '') }
  const day = raw.match(/今天|昨天|前天/)
  if (day) { const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (day[0] === '昨天' ? 1 : day[0] === '前天' ? 2 : 0)); from = start.getTime(); const end = new Date(start); end.setDate(end.getDate() + 1); to = end.getTime() - 1; raw = raw.replace(day[0], '') }
  const newFood = /新(东西|食物|食材)|第一次吃/.test(raw)
  const category = newFood || /饮食|吃了什么/.test(raw) ? 'diet' : /睡眠|睡觉|睡着|睡得|睡了/.test(raw) ? 'sleep' : /用药|吃药/.test(raw) ? 'medication' : undefined
  return { question, ...words(category ? raw.replace(/新东西|新食物|新食材|饮食|吃了什么|睡眠|睡觉|睡着|睡得怎样|睡了|用药|吃药|第一次吃/g, '') : raw), filters: [], excludes: [], from, to, first: /第一次|最早/.test(question) && !newFood, changes: /后来|变化|进展/.test(question), newFood, category }
}
export function findRecords(entries: readonly JournalEntry[], plan: FinderPlan): FinderMatch[] {
  if (!plan.terms.length && !plan.category) return []
  const direct: FinderMatch[] = [], related: FinderMatch[] = []
  for (const entry of entries) {
    const fields = journalSearchFields({...entry,aiNurse:undefined}), values = fields.map(normalizeJournalSearch)
    const has = (terms: string[]) => terms.some(t => values.some(v => v.includes(normalizeJournalSearch(t))))
    if (plan.category && !entry.categories?.includes(plan.category as never)) continue
    if (plan.filters.some(f => !has(f)) || plan.excludes.some(t => has([t]))) continue
    const at = Date.parse(entry.occurredAt), uncertain = entry.timePrecision === 'unknown' || !Number.isFinite(at)
    if (!uncertain && ((plan.from !== null && at < plan.from) || (plan.to !== null && at > plan.to))) continue
    const exact = plan.terms.every(has), nearby = plan.relatedTerms.length > 0 && has(plan.relatedTerms)
    if (!exact && !nearby) continue
    const newEvidence = !!entry.diet?.firstTryFoods?.length || fields.some(v => /第一次|首次|新食物|新食材|新东西|初次/.test(v))
    const negative = plan.terms.some(ts => ts.some(t => fields.some(v => new RegExp(`(?:没有|未见|无|没出现|没)[^，。；]{0,3}${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(v))))
    const possible = !exact || uncertain || negative || (plan.newFood && !newEvidence)
    const evidence = plan.newFood && entry.diet?.firstTryFoods?.length ? `首次尝试：${entry.diet.firstTryFoods.join('、')}。${entry.content}` : fields.find(v => plan.terms.some(ts => ts.some(t => v.includes(t))) || (plan.newFood && /第一次|首次|新食物|新食材/.test(v))) ?? entry.content
    const match = { entry, evidence, related: possible, reason: uncertain ? '发生时间不明确，无法确认范围或先后' : negative ? '原文是否定描述，不能当作发生过' : plan.newFood && !newEvidence ? '已有饮食记录，未明确写到首次或新食物' : !exact ? '可能相关的表达，不能视为同一健康情况' : undefined }
    ;(possible ? related : direct).push(match)
  }
  const order = (a: FinderMatch, b: FinderMatch) => (plan.first ? 1 : -1) * (Date.parse(a.entry.occurredAt) - Date.parse(b.entry.occurredAt) || a.entry.createdAt.localeCompare(b.entry.createdAt) || a.entry.id.localeCompare(b.entry.id))
  direct.sort(order); related.sort(order)
  if (plan.changes && direct.length) {
    // Follow changes only within the real matter containing the latest explicit match.
    const eventId = direct[0].entry.eventId
    const scoped = entries.filter(e => { if(e.eventId!==eventId)return false; const values=journalSearchFields({...e,aiNurse:undefined}).map(normalizeJournalSearch);const has=(terms:string[])=>terms.some(t=>values.some(v=>v.includes(normalizeJournalSearch(t))));const at=Date.parse(e.occurredAt);return !plan.filters.some(f=>!has(f))&&!plan.excludes.some(t=>has([t]))&&(e.timePrecision==='unknown'||(plan.from===null||at>=plan.from)&&(plan.to===null||at<=plan.to)) }).map(entry => { const original=related.find(m=>m.entry.id===entry.id);return { entry, evidence: entry.content, related: !!original || entry.timePrecision === 'unknown', reason: original?.reason ?? (entry.timePrecision === 'unknown' ? '发生时间不明确' : undefined) } })
    return scoped.sort((a, b) => Number(a.related) - Number(b.related) || order(a, b))
  }
  return [...direct, ...related]
}
export function finderAnswer(matches: readonly FinderMatch[], plan: FinderPlan) {
  const explicit = matches.filter(m => !m.related)
  if (!explicit.length) return plan.newFood ? '没有找到明确写到“首次尝试 / 新食物”的记录。下方饮食记录可供核对；没有记录不代表没有发生。' : '没有找到可以明确回答的记录。可能相关的内容在下方单独列出；没有记录不代表没有发生。'
  const firstEntry=explicit[0].entry
  const at = firstEntry.timePrecision==='exact'?new Date(firstEntry.occurredAt).toLocaleString('zh-CN'):`${new Date(firstEntry.occurredAt).toLocaleDateString('zh-CN')}（${firstEntry.timeLabel||'约'}）`
  return plan.first ? `已有记录中最早明确写到：${at}。\n${explicit[0].evidence}\n这是已有记录的最早日期，不能确定现实中第一次发生的时间。` : `${plan.changes ? '这次事项已有' : '找到'} ${explicit.length} 条明确相关记录。\n${explicit.slice(0, 3).map(m => `${new Date(m.entry.occurredAt).toLocaleDateString('zh-CN')}：${m.evidence}`).join('\n')}\n以上仅依据已有记录，不推断原因。`
}
