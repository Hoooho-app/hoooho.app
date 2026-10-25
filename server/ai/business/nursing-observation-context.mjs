import {clinicalContext} from '../../../shared/clinical-evidence.mjs'

// Literal observation topics, not diagnoses. Whole absence-events such as
// "没大便" are meaningful observations, unlike "没有腹泻".
export const nursingDomainPatterns=[
 ['respiratory',/咳|呼吸|喘|憋|呼噜|鼻塞|鼻涕|流涕|喷嚏|鼻.{0,3}堵|声嘶|声音.{0,4}(?:哑|变)|嗓音/gu],
 ['fever',/发热|发烧|体温|腋温|耳温|额温|热热的|有点烧|量着.{0,4}烧|摸着.{0,4}热|摸起来.{0,4}热/gu],
 ['injury',/淤青|划痕|被热|热杯.{0,5}碰|摔|跌|撞|碰伤|头.{0,3}碰|碰(?:到|了).{0,4}(?:桌|墙|地|门)|受伤|伤口|烫伤|割伤|扭伤/gu],
 ['urinary',/小便|尿不出|尿不出来|尿|排尿/gu],
 ['skin',/红点|疹|皮肤|红.{0,3}片|有点红|发红|挠|抓痒|(?<!止)痒|抓(?:肚|手|脚|腿|脸|背|头|身)|瘙痒|身上.{0,4}东西|小包/gu],
 ['bowel',/(?:没|未|不)(?:有)?(?:大便|排便|拉(?:便便|粑粑)?)|水样便|拉不出来|想拉.{0,5}不出来|拉稀|稀便|便便|大便|排便|拉得.{0,4}稀|腹泻|便秘|排便困难|一粒粒/gu],
 ['vomit',/吐奶|呕吐|吐了|吐出来|溢奶|溢出来|吐(?!槽|字|气|露)|嘴角.{0,8}流/gu],
 ['eye',/(?:左|右|双|两只|一只)眼|眼(?:睛|部|皮|角|红|屎)|(?:揉|抓|眨).{0,2}眼|流眼泪|流泪/gu],
 ['ear',/左耳|右耳|双耳|耳朵|耳部|耳道|耳痛|(?:揉|拉|摸|抓|揪|扯).{0,3}耳|耳.{0,3}(?:流液|流出|分泌物)/gu],
 ['oral',/口腔|嘴角|嘴唇|牙龈|牙齿|牙疼|牙痛|嘴里|嘴巴|口部|摸嘴|捂嘴|不肯咬|不愿吃硬|刷牙/gu],
 ['sleep',/没睡好|睡不好|睡不着|难入睡|入睡困难|睡眠|睡觉|睡得|睡着|睡稳|醒了|(?:晚上|夜里|半夜)醒|夜哭|醒来|醒后|夜醒|老醒/gu],
 ['pain',/疼|痛|不舒服|不适/gu],
 ['behaviour',/哭闹|抱.{0,8}哭|就哭|一直哭|爱哭|哭的时候|哭个不停|没精神|没有精神|精神不好|反应|行为|不对劲|不太对|怪怪|有点怪|看着怪|和平时不一样|活动.{0,5}(?:少|减少)|不愿(?:玩|动|讲话)|不像平时.{0,6}愿意讲话|话变少|一直坐着|一直躺着/gu]
]
const person=/孩子|宝宝|婴儿|患儿|本人|妈妈|爸爸|母亲|父亲|姐姐|哥哥|弟弟|妹妹|爷爷|奶奶|外公|外婆|同事|邻居|朋友/gu
const isCurrent=/^(?:孩子|宝宝|婴儿|患儿|本人)$/u
const normal=/(?:呼吸|尿量|排尿|精神|反应|饮水|进食|睡眠)(?:情况|量)?(?:看着|目前|现在)?(?:和|与)?(?:平时|往常|平常)?(?:相比)?(?:一样|差不多|无明显变化|没有变化|正常|顺畅|还好|未观察|没注意|没留意|不清楚)|睡得(?:挺|很|比较)?好|睡得安稳/u
const sleepConcern=/睡不好|没睡好|睡不着|入睡困难|难.{0,3}入睡|不踏实|睡眠.{0,5}(?:差|变|不好)|哭|闹|夜醒|老醒|醒来|醒了|晚上醒|夜里醒|半夜醒|频繁醒|断续/u
const explicitPain=/疼|痛|不舒服|不适/u
const loose=/拉稀|腹泻|稀便|便便.{0,5}(?:稀|水样)|大便.{0,5}(?:稀|水样)|拉得.{0,3}稀/u
const hard=/便秘|排便困难|(?:便便|大便).{0,5}(?:硬|干)|一粒粒|(?:没|未|不)(?:有)?(?:大便|排便|拉(?:便便|粑粑)?)/u
const personalOperation=/^(?:这个|这里|界面|软件|页面|按钮|输入框|录音|上传|网络).{0,16}(?:不对|异常|不舒服|不好|坏|卡)/u
const clonePattern=p=>new RegExp(p.source,p.flags)

export function nursingObservationContext(input){
 const text=String(input??''),clauses=[]
 let carriedSubject='current'
 for(const match of text.matchAll(/[^，,。；;！!？?\n]+/gu)){
  const raw=match[0],start=match.index,end=start+raw.length
  const who=[...raw.matchAll(person)].at(-1)?.[0]
  // A new source turn may be a different child observation; within a narrated
  // sentence an unlabelled continuation keeps its speaker/subject.
  if(start===0||text.slice(clauses.at(-1)?.end??0,start).includes('\n'))carriedSubject='current'
  if(who)carriedSubject=isCurrent.test(who)?'current':'other'
  const scope=clinicalContext(text,start,end)
  const eligible=carriedSubject==='current'&&!['historical','future','conditional'].includes(scope.temporality)&&!personalOperation.test(raw)&&!/[“”「」『』]/u.test(raw)&&!/(?:网上|书上|说明书|举个例子|医生问|护士问|问你.{0,8}记录|怎么记录|记录功能|卡片|入口|保存不了|什么意思|要是以后)/u.test(raw)&&!/(?:我自己|家长自己|不是孩子)/u.test(raw)
  const hits=[]
  if(eligible)for(const [domain,pattern] of nursingDomainPatterns)for(const hit of raw.matchAll(clonePattern(pattern))){
   const at=start+hit.index,assertion=clinicalContext(text,at,at+hit[0].length)
   const before=text.slice(assertion.clause.start,at)
   if(/(?:没|没有|未)(?:有)?(?:看到|看见|听到|听见|听说|听他(?:说)?).{0,8}$/u.test(before))continue
   if(/(?:不知道(?:是不是|是否|具体哪|算不算)|不确定(?:有没有|是否|是不是)|分不清|(?:没|没有|未|不)说).{0,15}$/u.test(before))continue
   if(assertion.polarity!=='affirmed'||assertion.subject!=='current'||assertion.temporality!=='current')continue
   if(domain==='pain'&&/^(?:还是|或是|或者)/u.test(raw.trim())&&/分不清|不知道|不确定/u.test(clauses.at(-1)?.text??''))continue
   if(domain==='skin'&&/眼|牙龈|口腔|嘴角|嘴唇|尿|小便/u.test(raw)&&!/皮肤|身上|小腿|手臂|躯干/u.test(raw))continue
   if(domain==='behaviour'&&/哭|闹/u.test(hit[0])&&(/睡|夜醒|醒来/u.test(raw)||!/(?:白天|今天|今早|上午|下午)/u.test(raw)&&clauses.at(-1)?.domains.includes('sleep')))continue
   const topic=domain==='skin'&&clauses.at(-1)?.activeDomains.includes('injury')&&!/头|脸|手|脚|腿|臂|背|胸|腹/u.test(raw)?'injury':domain
   hits.push({domain:topic,start:at,end:at+hit[0].length,quote:hit[0]})
  }
  const active=hits.filter(h=>!normal.test(raw)&&(h.domain!=='sleep'||sleepConcern.test(raw)))
  const domains=[...new Set(hits.map(h=>h.domain))]
  clauses.push({text:raw,start,end,eligible,subject:carriedSubject,domains,activeDomains:[...new Set(active.map(h=>h.domain))],hits})
 }
 // Supportive short answers/time/site clauses attach only to an immediately
 // preceding unambiguous topic. Medication counts never answer stool counts.
 let previous=[]
 for(const clause of clauses){
  if(!clause.eligible){previous=[];continue}
  if(clause.activeDomains.length){previous=clause.activeDomains;continue}
  if(!clause.domains.length&&previous.length===1&&!/药|毫克|毫升|\bmg\b|\bml\b|喷了/u.test(clause.text))clause.domains=[...previous]
 }
 for(let i=1;i<clauses.length;i++)if(clauses[i].activeDomains.includes('vomit')&&clauses[i-1].eligible&&!clauses[i-1].domains.length&&/(?:吃|喝|喂).{0,5}(?:完|后)|饭后|奶后/u.test(clauses[i-1].text))clauses[i-1].domains.push('vomit')
 const active=[...new Set(clauses.flatMap(c=>c.activeDomains))]
 const focusedClause=clauses.find(c=>c.eligible&&/(?:主要(?:想)?(?:记录|记|说)|重点(?:是|想记)|这次想记)/u.test(c.text))
 const focused=focusedClause?.activeDomains[0]??null
 const domain=focused??active[0]??null
 const scoped=(wanted,associated=[])=>clauses.filter(c=>c.eligible&&(c.domains.includes(wanted)||associated.some(d=>c.domains.includes(d)))).map(c=>c.text).join('，')
 return {text,clauses,active,focused,domain,scoped,variant:loose.test(scoped('bowel'))?'loose-stool':hard.test(scoped('bowel'))?'hard-stool':null}
}
