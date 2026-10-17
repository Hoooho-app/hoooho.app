import { outdoorActivitySummary } from '../HealthEvents/outdoorActivityLogic'
import { journalSearchAlternatives, journalSearchFields, journalSearchResultSummary, normalizeJournalSearch, searchJournalEntries, type JournalEntry } from '../HealthEvents/timeViewModel'
export interface FinderPlan { question: string; terms: string[][]; relatedTerms: string[]; filters: string[][]; excludes: string[]; from: number | null; to: number | null; first: boolean; changes: boolean; newFood: boolean; category?: string; anyTerms?: string[][][] }
export interface FinderMatch { entry: JournalEntry; evidence: string; related: boolean; reason?: string }
// Ordinary lookup uses the journal magnifier's existing matcher. The extended
// earliest/new-food/matter queries keep their evidence and uncertainty rules.
export function lookupRecords(entries: readonly JournalEntry[], question: string, now = new Date()): FinderMatch[] {
  if (!question.trim()) return []
  const sources = entries.map(entry => ({ ...entry, aiNurse: undefined }))
  const query = question.replace(/^(只看|只查|仅看|仅查|再看)/, '').replace(/上的/g, '')
  const plan = finderPlan(query, undefined, now)
  if (plan.first || plan.changes || plan.newFood || plan.from !== null || spokenIntent.test(query)) return findRecords(sources, plan)
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
// Broad lookup concepts expand only the query; they never change recorded facts.
const broadConcepts = [
  { query: /皮肤(?:情况|状况|表现|问题)?/g, terms: ['皮肤', '皮疹', '红疹', '疹子', '湿疹', '荨麻疹', '发痒', '瘙痒', '抓痒', '抓挠', '红点', '红斑', '发红', '红肿', '干燥', '脱皮', '起皮', '痘痘', '小疙瘩', '红屁股', 'skin', 'scratching'] },
  { query: /肉类|肉食|荤菜|肉/g, terms: ['猪肉', '牛肉', '羊肉', '鸡肉', '鸭肉', '鹅肉', '兔肉', '瘦肉', '肉类', '吃肉', '吃了肉', '吃过肉', '肉泥', '肉末', '肉粥', '肉丝', '肉片', '肉丸', '肉馅', '肉汤', '鸡胸', '鸡腿', '鸡翅', '鸡肝', '鸭腿', '鸭胸', '鸭肝', '猪肝', '猪蹄', '猪排', '牛排', '牛腩', '牛肝', '羊排', '排骨', '里脊', '培根', '火腿', '香肠', '鱼', '虾', '蟹', '贝类', '扇贝', '蛤蜊', '牡蛎', '贻贝'] },
  { query: /户外(?:活动)?|室外(?:活动)?|外出(?:活动)?|出门(?:活动)?/g, terms: ['户外', '室外', '外出', '出门', '散步', '公园', '草地', '遛弯', '爬山', '郊游', '露营', '骑车', '小区玩'] },
  { query: /接触\s*(?:过|到)?\s*(?:什么|哪些)?\s*(?:东西|环境|物品)?|环境/g, terms: ['接触', '环境', '户外', '公园', '草地', '花粉', '动物', '猫', '狗', '尘', '沙土', 'plants_pollen', 'animals', 'sand_soil', 'dust'] },
]
const spokenIntent = /皮肤|肉类|荤菜|所有|全部|调出来|找出来|帮我|查一下|户外|室外|外出|出门|接触|情况|状况/
const filler = /第一次|最早|最近一次|上次|后来|有什么变化|变化|最近|这次|那次|帮我|给我|让我|把|将|我想要|我想|我|想知道|想|知道|宝宝|孩子|麻烦|请问|请|查找|查一下|找一下|搜索|找出来|找出|查|找|看看|看一下|看|回想一下|回想|调出来|调出|列出来|列出|找出来|找出|都|一下|所有|全部|有关|相关|那些|哪些|那个|这个|记录|随记|有没有|是否|什么时候|是什么|什么|时候|吃过什么|用过什么|出现过|出现|发生过|发生|吃过|吃了|吃|喝过|喝了|喝|情况|状况|表现|问题|的|了|吗|呢|嗯|呃|在|过(?!敏)/g
function number(value: string): number {
  if (/^\d+$/.test(value)) return Number(value)
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  let total = 0, digit = 0
  for (const character of value) {
    if (character === '十' || character === '百') { total += (digit || 1) * (character === '十' ? 10 : 100); digit = 0 }
    else digit = digits[character] ?? 0
  }
  return total + digit
}
function wordTerms(text: string): { terms: string[][]; relatedTerms: string[] } {
  const terms: string[][] = [], relatedTerms: string[] = []
  let rest = text.replace(filler, ' ').replace(/[？?，,。！!：:；;]/g, ' ')
  // A specific food name stays specific: 鸡肉 must not become all meat.
  for (const concept of broadConcepts) {
    const expression = concept === broadConcepts[1] ? /肉类|肉食|荤菜|(?<![\p{Script=Han}])肉(?![\p{Script=Han}])/gu : concept.query
    if (expression.test(rest)) { terms.push(concept.terms); rest = rest.replace(expression, ' ') }
  }
  for (const concept of concepts) {
    const matched = concept.words.find(word => rest.includes(word))
    if (matched) { terms.push(concept.words); relatedTerms.push(...concept.related); for (const word of concept.words) rest = rest.replaceAll(word, ' ') }
    else {
      const nearby = concept.related.find(word => rest.includes(word))
      if (nearby) { terms.push([nearby]); relatedTerms.push(...concept.words, ...concept.related.filter(word => word !== nearby)); rest = rest.replaceAll(nearby, ' ') }
    }
  }
  if (terms.length && !terms.some(group => group === broadConcepts[1].terms)) {
    for (const aliases of Object.values(locations)) {
      const location = [...aliases].sort((a, b) => b.length - a.length).find(word => rest.includes(word))
      if (location) { terms.push(aliases); rest = rest.replace(new RegExp(`${location}(?:上|部)?`, 'g'), ' ') }
    }
  }
  const clean = rest.replace(filler, ' ').replace(/[？?，,。！!：:；;]/g, ' ')
  terms.push(...clean.split(/\s+/).filter(Boolean).map(journalSearchAlternatives))
  return { terms, relatedTerms }
}
function words(text: string) {
  const branches = text.split(/以及|还有|和|及|、/).map(wordTerms).filter(branch => branch.terms.length)
  const parsed = wordTerms(text)
  return branches.length > 1 ? { ...parsed, anyTerms: branches.map(branch => branch.terms) } : parsed
}
function lookupFields(entry: JournalEntry): string[] {
  const values = (value: unknown): string[] => typeof value === 'string' || typeof value === 'number' ? [String(value)] : Array.isArray(value) ? value.flatMap(values) : value && typeof value === 'object' ? Object.values(value).flatMap(values) : []
  return [...journalSearchFields({ ...entry, aiNurse: undefined }), ...(entry.outdoorActivity ? [outdoorActivitySummary(entry.outdoorActivity)] : []), ...values(entry.topical), ...values(entry.bowel), ...values(entry.visit)]
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
  const range = raw.match(/(?:最近|过去|近|这)([零〇一两二三四五六七八九十百\d]+|半)个?(月|天|周|星期)/)
  if (range) {
    const start = new Date(now), n = range[1] === '半' ? 0.5 : number(range[1])
    start.setHours(0, 0, 0, 0)
    if (range[2] === '月' && Number.isInteger(n)) {
      const day = start.getDate(); start.setDate(1); start.setMonth(start.getMonth() - n)
      const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(); start.setDate(Math.min(day, lastDay))
    } else start.setDate(start.getDate() - Math.ceil(n * (range[2] === '月' ? 30 : /周|星期/.test(range[2]) ? 7 : 1)))
    from = start.getTime(); to = now.getTime(); raw = raw.replace(range[0], '')
  }
  const day = raw.match(/今天|昨天|前天/)
  if (day) { const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (day[0] === '昨天' ? 1 : day[0] === '前天' ? 2 : 0)); from = start.getTime(); const end = new Date(start); end.setDate(end.getDate() + 1); to = end.getTime() - 1; raw = raw.replace(day[0], '') }
  const excludes = [...raw.matchAll(/(?:不含|排除|不要)([^\s，,。]+)/g)].map(match => match[1]); raw = raw.replace(/(?:不含|排除|不要)[^\s，,。]+/g, '')
  const newFood = /新(东西|食物|食材)|第一次吃/.test(raw)
  const category = /和|以及|还有|、/.test(raw) ? undefined : newFood || /饮食|吃了什么/.test(raw) ? 'diet' : /睡眠|睡觉|睡着|睡得|睡了/.test(raw) ? 'sleep' : /用药|吃药/.test(raw) ? 'medication' : undefined
  return { question, ...words(category ? raw.replace(/新东西|新食物|新食材|饮食|吃了什么|睡眠|睡觉|睡着|睡得怎样|睡了|用药|吃药|第一次吃/g, '') : raw), filters: [], excludes, from, to, first: /第一次|最早/.test(question) && !newFood, changes: /后来|变化|进展/.test(question), newFood, category }
}
export function findRecords(entries: readonly JournalEntry[], plan: FinderPlan): FinderMatch[] {
  if (!plan.terms.length && !plan.category) return []
  // Query vocabulary is constant for the whole scan. Normalize it once instead
  // of once per record field; preserve raw terms for evidence and negation.
  const groups = (terms: string[][]) => terms.map(group => group.map(normalizeJournalSearch))
  const terms = groups(plan.terms), anyTerms = plan.anyTerms?.map(groups)
  const filters = groups(plan.filters), excludes = plan.excludes.map(normalizeJournalSearch), relatedTerms = plan.relatedTerms.map(normalizeJournalSearch)
  const negativePatterns = plan.terms.flatMap(group => group.map(term => new RegExp(`(?:没有|未见|无|没出现|没)[^，。；]{0,3}${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)))
  const direct: FinderMatch[] = [], related: FinderMatch[] = []
  for (const entry of entries) {
    if (plan.category && !entry.categories?.includes(plan.category as never)) continue
    const at = Date.parse(entry.occurredAt), uncertain = entry.timePrecision === 'unknown' || !Number.isFinite(at)
    if (!uncertain && ((plan.from !== null && at < plan.from) || (plan.to !== null && at > plan.to))) continue
    const fields = lookupFields(entry), values = fields.map(normalizeJournalSearch)
    const has = (terms: string[]) => terms.some(t => values.some(v => v.includes(t)))
    if (filters.some(f => !has(f)) || excludes.some(t => has([t]))) continue
    const exact = anyTerms ? anyTerms.some(branch => branch.every(has)) : terms.every(has), nearby = relatedTerms.length > 0 && has(relatedTerms)
    if (!exact && !nearby) continue
    const newEvidence = !!entry.diet?.firstTryFoods?.length || fields.some(v => /第一次|首次|新食物|新食材|新东西|初次/.test(v))
    const negative = negativePatterns.some(pattern => fields.some(value => pattern.test(value)))
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
    const scoped = entries.filter(e => { if(e.eventId!==eventId)return false; const values=journalSearchFields({...e,aiNurse:undefined}).map(normalizeJournalSearch);const has=(terms:string[])=>terms.some(t=>values.some(v=>v.includes(t)));const at=Date.parse(e.occurredAt);return !filters.some(f=>!has(f))&&!excludes.some(t=>has([t]))&&(e.timePrecision==='unknown'||(plan.from===null||at>=plan.from)&&(plan.to===null||at<=plan.to)) }).map(entry => { const original=related.find(m=>m.entry.id===entry.id);return { entry, evidence: entry.content, related: !!original || entry.timePrecision === 'unknown', reason: original?.reason ?? (entry.timePrecision === 'unknown' ? '发生时间不明确' : undefined) } })
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
