import {clinicalContext} from '../../shared/clinical-evidence.mjs'
// Provenance gate for the existing five observation classes, not an exhaustive
// triage system. No rate, duration, age or treatment thresholds are introduced.
const importantObservationPattern=/呼吸(?:明显)?(?:困难|费力)|喘不过气|嘴唇[^，。；\n]{0,8}(?:发青|发紫)|叫不醒|没有反应(?=了|[啊呀，,。；;！!？?\s]|$)|意识不清|没有意识(?=了|[啊呀，,。；;！!？?\s]|$)|失去意识|抽搐/gu
const person=/孩子|宝宝|婴儿|患儿|妈妈|爸爸|母亲|父亲|哥哥|姐姐|弟弟|妹妹|爷爷|奶奶|外公|外婆|同事|邻居|朋友|家长自己|我|本人/gu
const currentPerson=/^(?:孩子|宝宝|婴儿|患儿)$/u
const past=/昨天|昨晚|前天|上周|以前|曾经|上次|去年|小时候/gu
const present=/现在|此刻|目前|正在|又|再次/gu
const lastIndex=(pattern,text)=>[...text.matchAll(pattern)].at(-1)?.index??-1
const inquiry=/(?:担心|害怕|会不会|是否|是不是|不确定|说不准|不知道|未确认|可能)/u
const recovered=/^(?:(?:现在|目前|已经|现已|后来|随后|都|也|又)\s*)*(?:正常|好了|恢复|缓解|不再|没有了|没了)/u
export function confirmedCurrentEmergency(assessment, latestUser){
  const text=latestUser?.text,quote=assessment?.quote?.trim()
  if(assessment?.currentChild!==true||typeof text!=='string'||!quote||!text.includes(quote))return false
  const ranges=[]
  for(let at=text.indexOf(quote);at>=0;at=text.indexOf(quote,at+Math.max(quote.length,1)))ranges.push([at,at+quote.length])
  for(const match of text.matchAll(importantObservationPattern)){
    const start=match.index,end=start+match[0].length
    if(!ranges.some(([a,b])=>a<=start&&end<=b))continue
    const scope=clinicalContext(text,start,end)
    if(scope.polarity!=='affirmed'||scope.subject!=='current'||['future','conditional'].includes(scope.temporality))continue
    const before=text.slice(scope.clause.start,start),after=text.slice(end,scope.clause.end).trim()
    // Source-scoped veto: checking model quote alone would drop negation/subject.
    if(inquiry.test(before)||/(?:说明书|网上|举例|举个例子|医生问|护士问)/u.test(before))continue
    if(/(?:没有|未见|没|不曾|否认)(?:发现|看到|观察到|出现)?(?:孩子|宝宝)?(?:现在|目前)?(?:有)?$/u.test(before))continue
    const sentenceBefore=text.slice(Math.max(text.lastIndexOf('。',start-1),text.lastIndexOf('！',start-1),text.lastIndexOf('？',start-1),text.lastIndexOf('\n',start-1))+1,start)
    const lastPersonMatch=[...sentenceBefore.matchAll(person)].at(-1),lastPerson=lastPersonMatch?.[0]
    const quotedChildI=lastPerson==='我'&&/(?:孩子|宝宝)(?:自述|说)[：:“"‘]?[^，。；\n]{0,20}$/u.test(sentenceBefore.slice(0,lastPersonMatch.index))
    if(lastPerson&&!currentPerson.test(lastPerson)&&!quotedChildI)continue
    const old=lastIndex(past,before),now=lastIndex(present,before)
    if((old>=0||scope.temporality==='historical')&&now<=old&&!/到现在|持续至今|仍未缓解/u.test(after))continue
    if(recovered.test(after))continue
    const next=text.slice(scope.clause.end).replace(/^[，,。；;\s]+/u,'').replace(/^(?:不过|但是|但|然后|接着)[，,\s]*/u,'')
    if(/^(?:现在|目前|现已|已经)/u.test(next)&&recovered.test(next))continue
    return true
  }
  return false
}

// Reuse the exact existing provenance gate before any optional model work.
export function confirmedCurrentEmergencyQuote(text){
  if(typeof text!=='string')return null
  for(const match of text.matchAll(importantObservationPattern))if(confirmedCurrentEmergency({currentChild:true,quote:match[0]},{text}))return match[0]
  return null
}
