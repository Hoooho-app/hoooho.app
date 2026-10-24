import { interpretNursingAnswer } from './nursing-interview.mjs'
import { clinicalAssertions, clinicalContext } from '../../../shared/clinical-evidence.mjs'

export const PROFESSIONAL_SUMMARY_VERSION = 'professional-summary-v1'

const labels = {
  symptom:'表现', location:'部位', severityOriginal:'家长描述程度', handling:'处理',
  food:'饮食', amount:'数量', unit:'单位', reaction:'相关表现', sleepAt:'入睡', wakeAt:'醒来',
  sleepKind:'睡眠类型', quality:'睡眠观察', bowelShape:'大便性状', bowelColor:'大便颜色',
  bowelPain:'排便相关不适', bowelCount:'排便次数', activity:'活动', durationMinutes:'持续时间',
  institution:'机构', department:'科室', doctorStatement:'医生意见', diagnosisCertainty:'结论确定程度',
  testName:'检查', result:'结果', referenceRange:'参考范围', abnormalFlag:'原异常标记',
  conclusion:'原资料结论', medicationName:'药品', doseOriginal:'原剂量', allergen:'过敏相关物',
  allergyStatus:'过敏记录状态', correction:'更正', reportType:'资料类型', chiefComplaint:'主要表现',
  followUp:'后续要求', historyName:'既往情况', frequency:'频率', route:'使用途径', statusRaw:'状态',
  relationship:'关系', vaccineName:'疫苗', manufacturerName:'厂家', batchNumber:'批号',
}
const observationalFields = new Set(['symptom','location','reaction','quality','bowelShape','bowelColor','bowelPain','bowelCount','activity','handling','chiefComplaint','frequency','statusRaw'])
const plainFields = new Set(['symptom','reaction','quality','activity','chiefComplaint','statusRaw'])
const clean = value => typeof value === 'string' ? value.trim() : ''
const numeral = value => {
  const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}
  if (Object.hasOwn(digits,value)) return String(digits[value])
  if (value==='十') return '10'
  const match=/^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(value)
  return match ? String((match[1]?digits[match[1]]:1)*10+(match[2]?digits[match[2]]:0)) : value
}

// These are literal language substitutions, not disease or cause inference.
// Approximate counts, doses, measurements, negations and uncertainty stay literal.
export function normalizeObservation(value) {
  let result=clean(value)
    .replace(/暂时没注意([^，。\n]{1,35})[，,]\s*先按已经说过的情况记录[。]?/gu,'$1未观察')
    .replace(/(?:^|\r?\n)(?:先按已经说过的情况记录，不再追问[。]?|先记下来[。]?|谢谢[。]?)(?=$|\r?\n)/gu,'')
    .replace(/^(?:嗯|呃)[，,、\s]+/u,'')
    .replace(/昨天晚上/gu,'昨晚').replace(/今天早上/gu,'今晨')
    .replace(/拉得很稀|拉得稀|拉稀/gu,'排稀便')
    .replace(/拉便便|拉粑粑/gu,'排便').replace(/尿尿/gu,'排尿')
    .replace(/肚子不舒服/gu,'腹部不适').replace(/肚子疼|肚子痛/gu,'腹痛')
    .replace(/头疼/gu,'头痛').replace(/嘴巴疼|嘴疼/gu,'口部疼痛')
    .replace(/尿量(?:没注意|没留意)|(?:没注意|没留意)尿量/gu,'尿量未观察')
    .replace(/体温(?:没量|没有量)|(?:没有量|没量)体温/gu,'未测体温')
    .replace(/(?:摸着|摸起来)(有点)?热/gu,(_,slight)=>`触感${slight?'略':''}热`)
    .replace(/起了?红点/gu,'出现红点').replace(/红红的/gu,'发红')
    .replace(/有点(?:发)?红/gu,'略发红')
    .replace(/抓痒|挠痒/gu,'抓挠')
    .replace(/发痒|痒痒/gu,'瘙痒').replace(/(?<![瘙止])痒/gu,'瘙痒')
    .replace(/抓来抓去|一直挠|老挠|不停挠|反复挠/gu,'反复抓挠')
    .replace(/(?:老|反复)(?:扯|拽)(?=(?:左|右)?耳朵)/gu,'反复牵拉')
    .replace(/(?:扯|拽)(?=(?:左|右)?耳朵)/gu,'牵拉').replace(/耳朵/gu,'耳')
    .replace(/睡不好/gu,'睡眠不佳').replace(/老醒/gu,'频繁醒来')
    .replace(/醒来就哭/gu,'醒后哭闹')
    .replace(/\r?\n+/gu,'；')
    .replace(/[。；]+；/gu,'；')
    .replace(/(?<![零一二两三四五六七八九十百千万\d到至或和、~～-])([一二两三四五六七八九]|(?:[一二三四五六七八九]?十[一二三四五六七八九]?))(次|回)/gu,(_,number)=>`${numeral(number)}次`)
  return result
}

function compatibleQuote(value, quote) {
  if (!quote.includes(value)) return false
  const expected=clinicalAssertions(value)
  const occurrences=[]
  for(let at=quote.indexOf(value);at>=0;at=quote.indexOf(value,at+Math.max(value.length,1)))occurrences.push(at)
  const actual=clinicalAssertions(quote)
  return occurrences.some(at=>expected.length?expected.every(assertion=>{
    const source=actual.find(candidate=>candidate.start===at+assertion.start&&candidate.end===at+assertion.end)
    return source&&source.concept===assertion.concept&&source.polarity===assertion.polarity&&source.subject===assertion.subject&&source.temporality===assertion.temporality
  }):['polarity','subject','temporality'].every(key=>clinicalContext(value,0,value.length)[key]===clinicalContext(quote,at,at+value.length)[key]))
}
function verified(field, sources) {
  const value=clean(field?.value)
  if(!value||value.length>4000)return false
  if(field.editedBy==='user'&&field.confirmed===true)return true
  return Array.isArray(field.sources)&&field.sources.some(ref=>{
    const quote=clean(ref.quote)
    if(!quote||!compatibleQuote(value,quote))return false
    if(!sources)return true // Caller already ran validateExtraction and locateEvidence.
    const source=sources.find(s=>s.id===ref.sourceId&&s.page===ref.page)
    return source&&typeof source.text==='string'&&source.text.includes(quote)
  })
}

// item is the already source-validated business item. Sources, when available,
// additionally bind every quote to this draft rather than trusting loose IDs.
export function buildProfessionalSummary(item, {sources}={}) {
  if(!item||typeof item.id!=='string'||!Array.isArray(item.fields)||!item.fields.length||item.fields.length>50||item.fields.some(f=>!verified(f,sources)))return null
  const answers=item.answerObservations??[]
  if(!Array.isArray(answers)||answers.length>3)return null
  for(const answer of answers){
    const expected=interpretNursingAnswer(answer.questionId,answer.answerText)
    if(!expected||expected.version!==answer.version||expected.text!==answer.text||typeof answer.sourceMessageId!=='string'||!answer.questionText)return null
    if(sources&&!sources.some(s=>typeof s.text==='string'&&s.text.includes(answer.answerText)))return null
  }
  const withoutShortAnswers=value=>answers.length?value.split(/\r?\n/).filter(line=>!answers.some(a=>line.trim()===a.answerText.trim())).join('，'):value
  const fields=item.fields.map((field,index)=>({field,id:`${item.id}:field:${index}`,value:observationalFields.has(field.name)?normalizeObservation(withoutShortAnswers(field.value)):clean(withoutShortAnswers(field.value))}))
  const claims=[]
  const add=(text,factIds)=>{
    text=clean(text)
    const duplicate=claims.find(claim=>claim.text===text)
    if(duplicate){duplicate.factIds=[...new Set([...duplicate.factIds,...factIds])];return}
    if(text)claims.push({text,factIds:[...new Set(factIds)]})
  }
  const primary=fields.find(entry=>['symptom','chiefComplaint','quality','activity','statusRaw'].includes(entry.field.name))
  const location=fields.find(entry=>entry.field.name==='location')
  const localizable=primary&&/^(?:出现)?(?:红点|皮疹|发红|略发红|红肿|瘙痒|疼痛|小包|肿胀|出血)/u.test(primary.value)
  let mergedLocation=false
  if(primary){
    if(location&&primary.value.includes(location.value)){add(primary.value,[primary.id,location.id]);mergedLocation=true}
    else if(location&&localizable){add(`${location.value}${primary.value}`,[primary.id,location.id]);mergedLocation=true}
    else add(primary.value,[primary.id])
  }
  for(const entry of fields){
    if(entry===primary||entry===location&&mergedLocation)continue
    add(plainFields.has(entry.field.name)?entry.value:`${labels[entry.field.name]??entry.field.name}：${entry.value}`,[entry.id])
  }
  for(const answer of answers)add(answer.text,['answer:'+answer.sourceMessageId])
  const time=clean(item.timeText)
  let addedTime=false
  if(time){
    const timeSupported=item.timeEditedBy==='user'||(item.timeSources??[]).some(ref=>clean(ref.quote).includes(time)&&(!sources||sources.some(s=>s.id===ref.sourceId&&s.page===ref.page&&s.text.includes(ref.quote))))||item.fields.some(f=>(f.sources??[]).some(ref=>clean(ref.quote).includes(time)))||Array.isArray(sources)&&sources.some(s=>typeof s.text==='string'&&s.text.includes(time)&&item.fields.some(f=>f.sources?.some(ref=>ref.sourceId===s.id&&ref.page===s.page)))
    if(!timeSupported)return null
    const normalizedTime=normalizeObservation(time)
    if(!claims.some(claim=>claim.text.includes(normalizedTime))){claims.unshift({text:normalizedTime,factIds:[`${item.id}:time`]});addedTime=true}
  }
  let text=(addedTime?`${claims[0].text}${/^(?:今天|今日|昨天|昨日|昨晚|昨夜|今晨|今早|今晚|前天)$/u.test(claims[0].text)?'':'，'}${claims.slice(1).map(claim=>claim.text).join('；')}`:claims.map(claim=>claim.text).join('；')).replace(/[；。]+$/u,'')
  if(!text||text.length>5000)return null
  text+='。'
  return {version:PROFESSIONAL_SUMMARY_VERSION,text,claims}
}

// A field ID alone cannot make an arbitrary generated diagnosis faithful.
// Only the exact deterministic projection is accepted for this version.
export function validateProfessionalSummary(candidate,item,options) {
  const expected=buildProfessionalSummary(item,options)
  return Boolean(expected&&candidate?.version===expected.version&&candidate.text===expected.text&&JSON.stringify(candidate.claims)===JSON.stringify(expected.claims))
}
