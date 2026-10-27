import { createHash } from 'node:crypto'
import { clinicalAssertions, evidenceClause, literalBodyObservations } from '../../../shared/clinical-evidence.mjs'

const array = value => Array.isArray(value) ? value : []
const text = value => typeof value === 'string' ? value : ''
const clone = value => structuredClone(value)
const usable = fact => fact && fact.scope !== 'context' && !['planned', 'quoted', 'concern'].includes(fact.polarity)
const active = fact => usable(fact) && fact.status === 'active'
const changeType = fact => fact.replaces ? 'correct' : 'add'
const sameScope = (left, right) => ['contextId', 'accountId', 'memberId'].every(key => left[key] == null || right[key] == null || left[key] === right[key])
const userSource = message => message && message.status === 'completed' && !['assistant', 'model', 'document', 'report', 'history', 'summary'].includes(message.kind) && !['assistant', 'model'].includes(message.role) && !message.quoted && !message.retracted
const positions = (original, part) => {
  const result = []
  if (part) for (let at = original.indexOf(part); at >= 0; at = original.indexOf(part, at + Math.max(1, part.length))) result.push(at)
  return result
}

function citations(fact, byId) {
  return array(fact.sources).flatMap(ref => {
    if (!ref || !text(ref.quote) || !text(fact.text)) return []
    const message = byId.get(ref.messageId)
    if (!userSource(message) || !sameScope(fact, message)) return []
    // ASR text remains an exact source tied to the retained original. An image
    // caption or untranscribed recording cannot masquerade as a transcript.
    if(ref.attachmentId&&!(message.kind==='voice'&&message.transcriptVerified===true&&array(message.voices).some(file=>file.id===ref.attachmentId&&file.mimeType?.startsWith('audio/'))))return []
    const candidates = positions(text(message.text), ref.quote).flatMap(start => positions(ref.quote, fact.text).map(offset => {
      const factStart = start + offset, factEnd = factStart + fact.text.length
      return { ref, message, factStart, factEnd, clause: evidenceClause(message.text, factStart, factEnd) }
    }))
    // A short repeated quote must not silently choose the wrong occurrence.
    return candidates.length === 1 ? candidates : []
  })
}

function questionFor(message, messages) {
  for (const metadata of [message.contextQuestion, message.answerQuestion]) {
    if (!metadata || typeof metadata !== 'object') continue
    const id = text(metadata.id || message.answerTo?.questionId), question = text(metadata.text), claimedTarget = text(metadata.target)
    if (!id || !question.trim()) continue
    let messageId = text(metadata.messageId || message.answerTo?.messageId)
    const matches = array(messages).filter(candidate => candidate.kind === 'assistant' && candidate.status === 'completed' && sameScope(candidate, message) && text(candidate.text).includes(question) && (!candidate.understanding?.nextQuestion || candidate.understanding.nextQuestion.id === id && candidate.understanding.nextQuestion.text === question && (!claimedTarget || !candidate.understanding.nextQuestion.target || candidate.understanding.nextQuestion.target === claimedTarget)))
    if (!messageId && matches.length === 1) messageId = matches[0].id
    if (!messageId) continue
    const actual = array(messages).find(candidate => candidate.id === messageId)
    if (actual && !matches.includes(actual)) continue
    const askedAt = actual?.inputAt ?? Date.parse(actual?.at), answeredAt = message.inputAt ?? Date.parse(message.at)
    if (Number.isFinite(askedAt) && Number.isFinite(answeredAt) && askedAt > answeredAt) continue
    // contextQuestion is server-captured metadata. Some callers intentionally
    // supply user source messages only; absent assistant rows are not invented.
    return { id, text: question, messageId, target: claimedTarget || actual?.understanding?.nextQuestion?.target || id }
  }
  return null
}

function questionContext(cites, messages) {
  const contexts = cites.map(cite => questionFor(cite.message, messages))
  if (!contexts.length || contexts.some(context => !context)) return null
  return new Set(contexts.map(context => JSON.stringify(context))).size === 1 ? contexts[0] : null
}

function sourceMetadata(fact, cites, messages) {
  const question = questionContext(cites, messages)
  const instants=[...new Set(cites.map(cite=>cite.message.inputAt??Date.parse(cite.message.at)).filter(Number.isFinite))]
  const sourceAt=instants.length===1?new Date(instants[0]).toISOString():null
  return { ...(sourceAt?{sourceAt}:{}),factId: fact.id, subject: clone(fact.subject), polarity: fact.polarity, changeType: changeType(fact), ...(question ? { questionContext: question } : {}) }
}

export function frontDeskLiteralReplacements(value){
 const result=[]
 const patterns=[{pattern:/(?:^|[，,。；;！!？?\n])\s*(?:不对[，,：:]?\s*)?不是\s*([^，,。；;！!？?\n]+?)\s*[，,；;]\s*(?:而)?是\s*([^，,。；;！!？?\n]+?)(?=$|[，,。；;！!？?\n])/gu,old:1,next:2},{pattern:/(?:^|[，,。；;！!？?\n])\s*是\s*([^，,。；;！!？?\n]+?)\s*[，,；;]\s*不是\s*([^，,。；;！!？?\n]+?)(?=$|[，,。；;！!？?\n])/gu,old:2,next:1}]
 for(const {pattern,old,next} of patterns)for(const match of text(value).matchAll(pattern)){
  const before=match[old].trim(),after=match[next].trim()
  const afterStart=match.index+(next===2?match[0].lastIndexOf(after):match[0].indexOf(after))
  if(before&&after&&before!==after)result.push({before,after,quote:match[0].replace(/^[，,。；;！!？?\n]\s*/u,'').trim(),afterStart,afterEnd:afterStart+after.length})
 }
 return result
}

function literalReplacement(fact, cites) {
  const replacements = []
  for (const cite of cites) {
    for (const {before,after,quote,afterStart,afterEnd} of frontDeskLiteralReplacements(cite.message.text)) {
      if (fact.text.includes(after) && cite.factStart <= afterStart && cite.factEnd >= afterEnd) replacements.push({ before, after,quote,messageId:cite.message.id })
    }
  }
  const unique = new Map(replacements.map(replacement => [JSON.stringify(replacement), replacement]))
  return unique.size === 1 ? [...unique.values()][0] : null
}

function replacementRole(fact,target,replacement,targetCites){
 if(!target||!usable(target)||target.status!=='superseded'||target.retractedBy||target.saved||target.recordId||array(target.recordIds).length||!sameScope(fact,target)||target.supersededBy&&fact.changeId&&target.supersededBy!==fact.changeId||!targetCites.length||literalReplacement(target,targetCites))return null
 const offsets=positions(text(target.text),replacement.before)
 if(offsets.length!==1)return null
 const at=offsets[0],end=at+replacement.before.length
 if(/^[+-]?\d+(?:\.\d+)?$/u.test(replacement.before)&&(/[\d.]/u.test(text(target.text[at-1]))||/[\d.]/u.test(text(target.text[end]))))return null
 return {version:'literal-replacement-v1',targetFactId:target.id,oldValue:replacement.before,newValue:replacement.after,quote:replacement.quote,messageId:replacement.messageId}
}

/** Program-owned replacement roles describe wording, not negative findings. */
export function frontDeskLiteralCorrection(source){
 const role=source?.literalCorrection
 if(source?.changeType!=='correct'||role?.version!=='literal-replacement-v1'||!['targetFactId','oldValue','newValue','quote','messageId'].every(key=>text(role[key]).trim())||role.oldValue===role.newValue||!text(source.text).includes(role.quote)||!role.quote.includes(role.oldValue)||!role.quote.includes(role.newValue))return null
 return role
}

const trimFragment = fragment => fragment.replace(/^[\s，,。；;！!？?、：:]+|[\s，,。；;！!？?、：:]+$/gu, '')
function extractable(fragment, subject) {
  if (!fragment) return false
  // Copying a remaining attribute is not a new clinical classifier. These
  // literal cues only prevent person-name/grammar fragments becoming sources.
  let nonIdentity = fragment
  if (text(subject?.label)) nonIdentity = nonIdentity.split(subject.label).join('')
  nonIdentity = nonIdentity.replace(/(?:\d+|[一二两三四五六七八九十]+)(?:岁半|周岁|岁|个月|月龄)/gu, '').replace(/孩子|宝宝|婴儿|患儿|患者|本人|自己|我家|我的|爸爸|妈妈|父亲|母亲|哥哥|姐姐|弟弟|妹妹|男孩|女孩|这个|那个|这位|那位|当前|其实|才是|是|的|在|有|了|[\s，,。；;：:]/gu, '')
  if (!nonIdentity) return false
  if (clinicalAssertions(fragment).length || literalBodyObservations(fragment).length) return true
  if (/^(?:不是|不对).*(?:[，,；;]\s*(?:而)?是)?\s*$/u.test(fragment)) return false
  return /\d|今天|今日|昨天|昨日|昨晚|今早|今晨|今晚|前天|前晚|上周|上月|去年|小时|分钟|秒|每天|每晚|早上|上午|中午|下午|晚上|夜里|(?:[一二两三四五六七八九十]+)(?:年|月|日|号|点|时|分|次|片|粒|滴|毫升|毫克)|(?:左|右)?(?:头|脸|颈|脖子|喉咙|口|唇|牙|胸|腹|肚子|背|腰|肩|胳膊|手|腕|指|腿|膝|足|脚|趾|臀|屁股)|疼|痛|肿|痒|红点|红斑|伤|破皮|磕|碰|撞|摔|体温|血压|心率|血糖|血氧|吃|喝|喂|服用|用药|药品|剂量|接种|疫苗|睡|醒|排便|大便|小便|尿|检查|报告|就诊|涂抹|护理|(?:^|\s)(?:ml|mL|mg|g|kg|IU|U|℃|°C|mmol\/L)(?:$|\s)/u.test(fragment)
}

function retainedSources(fact, target, replacement, cites, messages) {
  if (!target || !usable(target) || target.status !== 'superseded' || target.retractedBy || target.saved || target.recordId || array(target.recordIds).length || !sameScope(fact, target) || target.supersededBy && fact.changeId && target.supersededBy !== fact.changeId) return []
  // A previous correction is not a fresh description of the old situation.
  // Do not recursively revive its negated side or reconstruct hidden ancestors.
  if (literalReplacement(target, cites)) return []
  const offsets = positions(text(target.text), replacement.before)
  if (offsets.length !== 1) return []
  const retained = []
  for (const cite of cites) {
    const start = cite.factStart + offsets[0], end = start + replacement.before.length
    if (/^[+-]?\d+(?:\.\d+)?$/u.test(replacement.before) && /[\d.]/u.test(text(cite.message.text[start - 1])) || /^[+-]?\d+(?:\.\d+)?$/u.test(replacement.before) && /[\d.]/u.test(text(cite.message.text[end]))) continue
    for (const raw of [cite.message.text.slice(cite.clause.start, start), cite.message.text.slice(end, cite.clause.end)]) {
      const fragment = trimFragment(raw)
      if (!extractable(fragment, target.subject)) continue
      const narrowed = { ...clone(cite.ref), quote: fragment }
      const digest = createHash('sha256').update(JSON.stringify([target.id, fact.id, cite.message.id, cite.clause.start, fragment])).digest('hex').slice(0, 24)
      retained.push({ id: `retained-${digest}`, page: 1, text: fragment, status: 'readable', ...sourceMetadata(target, [cite], messages), originalReferences: [narrowed], retainedFromFactId: target.id, amendedBy: fact.id })
    }
  }
  return retained
}

/** Preserve only exact user-source clauses and explicitly unchanged fragments. */
export function buildFrontDeskFactSources({ facts = [], messages = [] } = {}) {
  const byId = new Map(array(messages).map(message => [message.id, message])), ledger = new Map(array(facts).map(fact => [fact.id, fact]))
  const sources = [], seen = new Set()
  for (const fact of array(facts).filter(active)) {
    const cites = citations(fact, byId)
    if (!cites.length || seen.has(fact.id)) continue
    seen.add(fact.id)
    const source={ id: fact.id, page: 1, text: [...new Set(cites.map(cite => cite.clause.text))].join('\n'), status: 'readable', ...sourceMetadata(fact, cites, messages), originalReferences: clone(cites.map(cite => cite.ref)) }
    sources.push(source)
    const replacement = fact.replaces && literalReplacement(fact, cites)
    if (!replacement || array(facts).filter(candidate => active(candidate) && candidate.replaces === fact.replaces).length !== 1) continue
    const target = ledger.get(fact.replaces)
    const targetCites=target?citations(target,byId):[],role=replacementRole(fact,target,replacement,targetCites)
    if(role){source.literalCorrection=role;if(!source.text.includes(role.quote))source.text=role.quote}
    const retained = retainedSources(fact, target, replacement, targetCites, messages)
    for (const source of retained) if (!seen.has(source.id)) { seen.add(source.id); sources.push(source) }
  }
  return sources
}
