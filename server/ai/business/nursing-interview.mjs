import { clinicalAssertions } from '../../../shared/clinical-evidence.mjs'
import recordingKnowledge from './nursing-recording-knowledge.json' with {type:'json'}

export const NURSING_KNOWLEDGE_VERSION = 'observation-recording-20261024-v1'
// Original documentation questions, not copied guideline text, diagnostic
// criteria, treatment advice or a claim of clinical certification.
export const nursingMethodSources = [
  {id:'rch-assessment',title:'Nursing assessment',url:'https://www.rch.org.au/rchcpg/hospital_clinical_guideline_index/Nursing_assessment/',purpose:'focused observation and age-appropriate communication'},
  {id:'rch-pain',title:'Pain assessment and measurement',url:'https://www.rch.org.au/rchcpg/hospital_clinical_guideline_index/Pain_Assessment_and_Measurement/',purpose:'reported pain versus observed behaviour'},
  {id:'rch-handover',title:'Nursing clinical handover',url:'https://www.rch.org.au/rchcpg/hospital_clinical_guideline_index/Nursing_clinical_handover/',purpose:'concise communication of observed information'},
  {id:'who-imci',title:'IMCI distance learning modules',url:'https://www.who.int/publications/i/item/9789241506823',purpose:'basic symptom domains; no imported treatment thresholds'}
]

const option=(label,value)=>({label,value})
const unknown=target=>option('没注意',`暂时没注意${target}，先按已经说过的情况记录。`)
const onset=/(?:今天|今日|昨天|昨日|昨晚|今早|前天|刚才|刚刚|最近|这[一二三四五六七八九十两\d]+天|[一二三四五六七八九十两\d]+(?:天|晚|小时|分钟|周)|\d{1,2}月\d{1,2}日|开始时间.*(?:不清楚|不记得))/
const body=/(?:头|面|脸|嘴|口部|口腔|牙|耳|眼|鼻|颈|脖|胸|背|腰|腹|肚|臀|屁股|手|脚|腿|臂|全身|会阴|尿道)/
const nodes = [
  {id:'skin-location',domain:'skin',priority:95,known:body,text:'变化出现在哪个部位？可以点身体部位，也可以拍一张照片。',options:[option('头面部','变化在头面部。'),option('躯干','变化在躯干。'),option('四肢','变化在四肢。'),unknown('具体部位')]},
  {id:'skin-appearance',domain:'skin',priority:90,known:/红点|红疹|疹子|红斑|小包|水泡|水疱|成片|破皮|渗液|脱皮/,text:'那里的变化看起来更像红点、成片发红，还是小包？不确定也可以拍照保留。',options:[option('红点','那里出现了红点。'),option('成片发红','那里是成片发红。'),option('小包','那里出现了小包。'),unknown('具体外观')]},
  {id:'skin-sensation',domain:'skin',priority:80,known:/痒|挠|抓|疼|痛/,text:'孩子有说痒或疼，还是您看到他一直抓挠？',options:[option('说痒','孩子说那里痒。'),option('说疼','孩子说那里疼。'),option('看到抓挠','我看到孩子反复抓挠那里。'),unknown('孩子的具体感受')]},
  {id:'resp-effort',domain:'respiratory',priority:100,known:/(?:呼吸|喘).{0,12}(?:费力|困难|正常|平时|还好|顺畅|没有异常)|不喘|没有喘|胸口.{0,8}起伏/,text:'咳嗽或声音变化之外，现在呼吸和平时相比，有没有明显费力？',options:[option('看着和平时一样','家长观察目前呼吸看着和平时一样。'),option('看到明显费力','家长现在看到孩子呼吸明显费力。'),unknown('目前呼吸是否费力')]},
  {id:'cough-pattern',domain:'respiratory',priority:85,known:/夜|躺|早|晚|白天|跑|运动|睡|进食|喝水|吃东西/,text:'咳嗽通常在什么情况下更明显，比如躺下、活动时，还是没有特别规律？',options:[option('躺下时','咳嗽在躺下时更明显。'),option('活动时','咳嗽在活动时更明显。'),option('没明显规律','家长暂未发现咳嗽的明显规律。'),unknown('咳嗽的规律')]},
  {id:'fever-measurement',domain:'fever',priority:95,known:/(?:\d{2}(?:\.\d+)?|三十[五六七八九]|四十)(?:\s*[℃度]|\s*摄氏度)|未测|没量|没测|尚未测|还没量/,text:'目前是摸着热，还是已经量过体温？量过的话，把数字和测量部位告诉我就好。',options:[option('还没量','家长感到孩子摸着热，目前尚未测量体温。'),option('已经量过','已经测量体温，具体数值待补充。'),unknown('是否已测体温')]},
  {id:'fever-state',domain:'fever',priority:85,known:/精神|反应|玩耍|愿意玩|不愿玩|活动|吃喝|喝水|饮水|尿量/,text:'除了发热这件事，孩子现在的精神和反应，和平时相比有什么变化？',options:[option('看着和平时一样','家长观察孩子目前精神和反应看着和平时一样。'),option('比平时没精神','家长观察孩子目前比平时没精神。'),unknown('精神和反应的变化')]},
  {id:'stool-count',domain:'bowel',priority:90,known:/[一二三四五六七八九十两\d]+次|没数|次数.{0,8}(?:不清|不知道|没注意)/,text:'这次便便变稀大约出现了几次？没数清也可以先留空。',options:[option('1次','这次稀便出现了1次。'),option('2次','这次稀便出现了2次。'),option('3次','这次稀便出现了3次。'),unknown('具体稀便次数')]},
  {id:'bowel-urine',domain:'bowel',priority:80,known:/尿量|尿尿|小便|尿湿|尿布|排尿/,text:'这段时间尿量或尿湿尿布的情况，和平时相比有变化吗？',options:[option('差不多','家长观察这段时间尿量和平时差不多。'),option('比平时少','家长观察这段时间尿量比平时少。'),unknown('这段时间尿量的变化')]},
  {id:'vomit-course',domain:'vomit',priority:90,known:/饭后|奶后|喂后|吃完|喝完|进食|[一二三四五六七八九十两\d]+次/,text:'这次吐是吃喝之后发生的吗？您记得的经过就可以，不需要先判断是不是吐奶。',options:[option('吃喝后','这次吐是在吃喝之后发生。'),option('没有吃喝关联','家长暂未发现这次吐与吃喝的关联。'),unknown('吐与吃喝的先后经过')]},
  {id:'pain-location',domain:'pain',priority:95,known:body,text:'孩子有没有指向或护住某个部位？不会说也可以告诉我您看到的动作。',options:[option('指着肚子','家长看到孩子指向肚子。'),option('指着嘴巴','家长看到孩子指向嘴巴。'),option('没有明确部位','家长暂未发现孩子指向或护住明确部位。'),unknown('孩子是否指向某个部位')]},
  {id:'pain-impact',domain:'pain',priority:85,known:/吃|喝|睡|走|玩|活动|安抚|抱|反应/,text:'这种不适有没有影响吃喝、活动或入睡？说一个最明显的变化就可以。',options:[option('影响吃喝','家长观察这次不适影响了孩子吃喝。'),option('影响活动','家长观察这次不适影响了孩子活动。'),option('影响入睡','家长观察这次不适影响了孩子入睡。'),unknown('这次不适对日常状态的影响')]},
  {id:'urinary-change',domain:'urinary',priority:90,known:/尿频|次数|尿量|颜色|尿色|尿血|红色|量少|尿少/,text:'排尿时的表现之外，尿的次数、量或颜色有没有哪一项和往常不同？',options:[option('次数变多','家长观察排尿次数比往常多。'),option('量变少','家长观察尿量比往常少。'),option('颜色有变化','家长观察尿的颜色和往常不同，具体颜色待补充。'),unknown('尿的次数、量或颜色')]},
  {id:'injury-function',domain:'injury',priority:100,known:/走路|活动|抬|拿|使用|负重|不能走|不肯走|出血|伤口|肿/,text:'受伤的部位现在活动或使用时，和平时有什么不同？',options:[option('还能照常活动','家长观察受伤部位目前还能照常活动。'),option('活动明显受限','家长观察受伤部位目前活动明显受限。'),unknown('受伤部位的活动情况')]},
  {id:'injury-course',domain:'injury',priority:85,known:/摔|跌|撞|碰|砸|烫|咬|划|割|抓伤|扭/,text:'您知道这次受伤是怎么发生的吗？不清楚就保留为经过未明。',options:[option('摔倒','这次受伤发生在摔倒后。'),option('碰撞','这次受伤发生在碰撞后。'),unknown('具体受伤经过')]},
  {id:'sleep-awakening',domain:'sleep',priority:90,known:/醒来|醒了|夜醒|醒后|没醒|睡着后醒|闭眼|睁眼/,text:'哭闹时孩子是醒着能回应您，还是闭着眼、像没醒？',options:[option('醒着能回应','哭闹时孩子醒着，能回应家长。'),option('像没醒','哭闹时孩子闭着眼，家长不确定是否清醒。'),unknown('哭闹时是否清醒')]},
  {id:'oral-observation',domain:'sleep',priority:90,trigger:/摸嘴|捂嘴|口腔|嘴巴|口部|牙|刷牙|不肯咬|回避硬|不愿吃硬/,known:/刷牙.{0,12}(?:痛|疼|躲)|(?:硬食|硬的|吃东西).{0,10}(?:回避|不愿|不肯|痛|疼)|口腔疼痛.{0,8}(?:未确认|不清楚)/,text:'白天吃东西或刷牙时，会不会躲开，或者表现出嘴里疼？没注意也可以。',options:[option('看到躲开','家长看到孩子吃东西或刷牙时躲开，具体是否疼痛未确认。'),option('孩子说嘴疼','孩子自述嘴里疼。'),unknown('吃东西或刷牙时是否有口腔不适')]},
  {id:'sleep-consolation',domain:'sleep',priority:80,known:/安抚|抱.{0,10}(?:好|静|睡)|自己.{0,6}睡|哄/,text:'哭闹后安抚一下，孩子能平静下来或再次入睡吗？',options:[option('能平静下来','哭闹后经家长安抚，孩子可以平静下来。'),option('能再次入睡','哭闹后经家长安抚，孩子可以再次入睡。'),option('仍哭闹','哭闹后经家长安抚，孩子仍持续哭闹。'),unknown('安抚后的变化')]},
  {id:'behaviour-change',domain:'behaviour',priority:90,known:/和平时|往常|平常|反应|持续|开始|今天|昨天/,text:'和孩子平时相比，您最明显看到的是哪一个行为变化？可以只描述一个动作或反应。',options:[option('活动变少','家长观察孩子活动比平时少。'),option('反应有变化','家长观察孩子反应和平时不同，具体表现待补充。'),unknown('具体行为变化')]}
]
const domains=[
  ['respiratory',/咳|呼吸|喘|憋|呼噜|鼻塞/],['fever',/发热|发烧|体温|摸着.{0,4}热|摸起来.{0,4}热/],
  ['injury',/摔|跌|撞|碰伤|受伤|伤口|烫伤|割伤|扭伤/],['urinary',/尿|排尿/],['skin',/红点|疹|皮肤|红.{0,3}片|有点红|发红|挠|抓痒|瘙痒|身上.{0,4}东西|小包/],
  ['bowel',/拉稀|稀便|便便|大便|排便|拉得.{0,4}稀|腹泻/],['vomit',/吐奶|呕吐|吐了|吐出来|溢奶/],
  ['sleep',/睡|夜哭|醒来|醒后|夜醒|[一二三四五六七八九十两\d]+晚/],['pain',/疼|痛|不舒服|不适|哭闹|一直哭|(?:扯|牵拉|捂|摸).{0,4}耳|摸嘴|捂嘴|不肯咬|不愿吃硬/],['behaviour',/没精神|精神不好|反应|行为|不对劲/]
]
export function nursingMemberContext(member={},now=new Date(),timeZone='Asia/Shanghai') {
  const birthday=member.birthday??member.birthDate
  const date=typeof birthday==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(birthday)?new Date(`${birthday}T00:00:00Z`):null
  const instant=new Date(now)
  const civil=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant).map(p=>[p.type,p.value]))
  let ageMonths=null
  if(date&&Number.isFinite(date.getTime())&&birthday<=`${civil.year}-${civil.month}-${civil.day}`){ageMonths=(Number(civil.year)-date.getUTCFullYear())*12+Number(civil.month)-1-date.getUTCMonth();if(Number(civil.day)<date.getUTCDate())ageMonths--}
  return {ageMonths:ageMonths!==null&&ageMonths>=0?ageMonths:null,gender:['male','female'].includes(member.gender)?member.gender:null}
}
const observationText=text=>{
  let result=String(text??'')
  for(const a of clinicalAssertions(result).reverse())if(a.subject==='other'||a.polarity==='negated'||['future','conditional','historical'].includes(a.temporality))result=result.slice(0,a.start)+' '.repeat(a.end-a.start)+result.slice(a.end)
  return result
    .replace(/(?:呼吸|尿量|排尿|精神|反应|饮水|进食)(?:情况|量)?(?:看着|目前|现在)?(?:和|与)?(?:平时|往常|平常)?(?:相比)?(?:一样|差不多|无明显变化|没有变化|正常|顺畅|还好|未观察|没注意|没留意|不清楚)/g,' ')
    .replace(/(?:没有|未见|无)(?:明显)?(?:呼吸费力|呼吸困难|喘息|咳嗽|尿量减少)/g,' ')
}
export function assignNursingAnswers(items,observations=[]) {
  const itemDomains=items.map(item=>{
    const text=observationText(item.fields.map(field=>field.value).join('\n'))
    const result=new Set(domains.filter(([,pattern])=>pattern.test(text)).map(([domain])=>domain))
    if(item.category==='sleep')result.add('sleep')
    if(item.category==='injury')result.add('injury')
    return result
  })
  for(const observation of observations){
    const matches=items.filter((item,index)=>itemDomains[index].has(observation.domain))
    // An answer belongs to the observation it qualified. Ambiguous matches stay
    // in the dialogue evidence rather than being attached to an unrelated item.
    if(matches.length===1)(matches[0].answerObservations??=[]).push(observation)
  }
}
export function nursingKnowledgeFor(text,member={}) {
  const observed=observationText(text),active=domains.map(([name,pattern])=>({name,index:observed.search(pattern)})).filter(item=>item.index>=0).sort((a,b)=>a.index-b.index)
  const focus=observed.match(/(?:主要(?:想)?(?:记录|记|说)|重点(?:是|想记)|这次想记)(.{1,80})/)?.[1]
  const focused=focus&&domains.find(([,pattern])=>pattern.test(focus))?.[0]
  const domain=focused||active[0]?.name||null
  if(!domain)return {domain:null,nodes:[],cards:[],member}
  const available=nodes.filter(n=>(active.some(d=>d.name===n.domain)||n.id==='oral-observation'&&active.some(d=>d.name==='pain'))&&(!n.trigger||n.trigger.test(observed))&&!n.known.test(text)).map(n=>n.id==='oral-observation'&&domain==='pain'?{...n,domain:'pain'}:n).sort((a,b)=>(b.domain===focused?1:0)-(a.domain===focused?1:0)||b.priority-a.priority)
  const handling=recordingKnowledge.handlingResponseNode
  const handled=observed.split(/[，。；\n]/).some(clause=>new RegExp(handling.triggerPattern).test(clause)&&!new RegExp(handling.skipClausePattern).test(clause)&&!/(?:哥哥|姐姐|别人|我自己|家长自己).{0,12}(?:涂|擦|洗|服|吃|用|处理)/.test(clause))
  if(handled&&!new RegExp(handling.knownPattern).test(text))available.push({...handling,domain,known:/$^/})
  available.sort((a,b)=>(b.domain===focused?1:0)-(a.domain===focused?1:0)||b.priority-a.priority)
  if(!onset.test(text))available.push({id:`${domain}-onset`,domain,priority:75,text:'这种变化大约从什么时候开始？不记得具体时间也可以。',options:[option('今天','这种变化从今天开始。'),option('昨天','这种变化从昨天开始。'),option('最近几天','这种变化在最近几天出现，具体起点不清楚。'),unknown('具体开始时间')]})
  const cards=[...new Set([domain,...active.map(d=>d.name)])].slice(0,2).map(name=>({domain:name,version:recordingKnowledge.version,reviewStatus:recordingKnowledge.reviewStatus,...recordingKnowledge.domainCards[name]}))
  return {domain,cards,nodes:available.slice(0,5).map(n=>{
    const infant=Number.isInteger(member.ageMonths)&&member.ageMonths<18
    const wording=infant&&n.id==='skin-sensation'?{text:'您看到孩子会反复抓挠那里，或在碰到时躲开吗？只记录您观察到的动作就可以。',options:[option('看到抓挠','家长看到孩子反复抓挠那里。'),option('碰到时躲开','家长看到孩子在碰到那里时躲开。'),unknown('皮肤变化时的具体动作')]}:infant&&n.id==='pain-location'?{text:'哭闹时孩子有没有反复护住、摸向某个部位，或在某个动作时躲开？',options:n.options}:infant&&n.id==='oral-observation'?{options:n.options.filter(o=>o.label!=='孩子说嘴疼')}:{}
    return {id:n.id,domain:n.domain,priority:n.priority,text:n.text,options:n.options,...wording,sourceIds:n.sourceIds??(n.id.startsWith('pain-')||n.id==='oral-observation'?['rch-assessment','rch-pain']:['rch-assessment'])}
  }),member}
}
export const stopsNursingInterview=text=>/^(?:谢谢|谢谢你|谢谢您|好了|好的|好|嗯|没了|没有了|不说了|先这样)[。！!，,\\s]*$/.test(text.trim())||/(?:先|就|直接|帮我|不再追问.{0,6})(?:按.{0,16})?(?:记下来|记录|保存|整理)|不(?:要|再)?(?:继续)?(?:问了|追问)|到这里|先这样/.test(text)||/^(?:我也|我|暂时)?(?:不(?:太)?知道|不(?:太)?清楚|没(?:有)?注意|没留意|记不清|不记得)(?:了|这个|具体情况|具体时间|具体次数|具体部位)?[，,。\s]*(?:先.{0,20}(?:记|保存|整理).*)?$/.test(text.trim())||/^暂时没注意.{0,35}先按已经说过的情况记录/.test(text)
export function nursingInterview({text,latestText,previous,requestedQuestionId,member,urgent=false}) {
  const knowledge=nursingKnowledgeFor(text,member),asked=[...new Set(previous?.askedQuestionIds??[])]
  const stop=stopsNursingInterview(latestText??text)
  const available=knowledge.nodes.filter(n=>!asked.includes(n.id))
  const explicitReady=requestedQuestionId===null
  const reason=urgent?'important_observation':stop?'user_finished':previous?.status==='ready'?'already_finished':asked.length>=3?'question_budget':explicitReady?'sufficient_information':asked.length>=2&&(available[0]?.priority??0)<90?'enough_for_record':!available.length?'no_relevant_gap':null
  const question=reason?null:available.find(n=>n.id===requestedQuestionId)??available[0]??null
  return {version:NURSING_KNOWLEDGE_VERSION,status:urgent?'urgent':question?'asking':'ready',domain:question?.domain??knowledge.domain,turnCount:question?asked.length+1:asked.length,askedQuestionIds:question?[...asked,question.id]:asked,stopReason:question?null:reason??'sufficient_information',question:question?{id:question.id,text:question.text,options:question.options,sourceIds:question.sourceIds}:null}
}

// Only unambiguous short replies to a persisted question can be expanded.
// Other utterances remain literal source text for the normal extraction path.
export function interpretNursingAnswer(questionId,answer) {
  const raw=String(answer??'').trim().replace(/[。！!，,\s]+$/u,'')
  const unknownTargets={'skin-location':'变化的具体部位','skin-appearance':'变化的具体外观','skin-sensation':'孩子的具体感受或相关动作','resp-effort':'目前呼吸是否明显费力','cough-pattern':'咳嗽的规律','fever-measurement':'是否已测体温','fever-state':'精神和反应的变化','stool-count':'稀便的具体次数','bowel-urine':'这段时间尿量的变化','vomit-course':'吐与吃喝的先后经过','pain-location':'不适的具体部位','pain-impact':'不适对日常状态的影响','urinary-change':'尿的次数、量或颜色变化','injury-function':'受伤部位的活动情况','injury-course':'受伤经过','sleep-awakening':'哭闹时是否清醒','oral-observation':'是否存在口腔不适','sleep-consolation':'安抚后的变化','behaviour-change':'具体行为变化','handling-response':'处理后的变化'}
  if(/^(?:我也|我|暂时)?(?:不知道|不清楚|没注意|没留意|记不清|不记得)$/.test(raw)){
    const target=unknownTargets[questionId]??(questionId.endsWith('-onset')?'具体开始时间':null)
    return target?{version:NURSING_KNOWLEDGE_VERSION,text:`${target}暂不清楚`,polarity:'unknown'}:null
  }
  const polarity=/^(?:没有|没|没有啊|没看到|没发现|不会)$/.test(raw)?'no':/^(?:有|有的|有啊|是|是的|会)$/.test(raw)?'yes':null
  const meanings={
    'resp-effort':{yes:'家长观察到孩子呼吸明显费力',no:'家长未见孩子有明显呼吸费力'},
    'bowel-urine':{yes:'家长观察尿量或尿湿尿布情况有变化，具体变化尚未说明',no:'家长暂未发现尿量或尿湿尿布情况有明显变化'},
    'urinary-change':{yes:'家长观察尿的次数、量或颜色有变化，具体项目尚未说明',no:'家长暂未发现尿的次数、量或颜色有明显变化'},
    'pain-impact':{yes:'家长观察本次不适影响日常状态，具体方面尚未说明',no:'家长暂未发现本次不适明显影响吃喝、活动或入睡'},
    'oral-observation':{yes:'家长观察进食或刷牙时有躲避或疼痛表现，具体表现尚未明确',no:'家长暂未见进食或刷牙时躲避或疼痛表现'},
    'sleep-consolation':{yes:'家长称安抚后可平静或再次入睡，具体情况尚未明确',no:'家长称安抚后仍难以平静或再次入睡'}
  }
  return polarity&&meanings[questionId]?{version:NURSING_KNOWLEDGE_VERSION,text:meanings[questionId][polarity],polarity}:null
}

export function nursingAnswerObservations(messages=[]) {
  const superseding={ 'resp-effort':/呼吸|喘|憋/,'bowel-urine':/尿|排尿/,'urinary-change':/尿|排尿/,'pain-impact':/吃|喝|睡|玩|活动/,'oral-observation':/嘴|口腔|牙|刷|吃东西/,'sleep-consolation':/安抚|抱|平静|睡/ }
  return messages.flatMap((message,index)=>{
    if(!message.answerTo||!message.answerQuestion||message.kind==='assistant'||message.status!=='completed')return []
    const interpretation=interpretNursingAnswer(message.answerTo.questionId,message.text)
    if(!interpretation)return []
    const relevant=superseding[message.answerTo.questionId]??nodes.find(n=>n.id===message.answerTo.questionId)?.known??(message.answerTo.questionId.endsWith('-onset')?onset:null)
    if(messages.slice(index+1).some(m=>m.kind!=='assistant'&&m.status==='completed'&&relevant?.test(m.text)))return []
    return [{...interpretation,sourceMessageId:message.id,answerText:message.text,questionId:message.answerTo.questionId,questionText:message.answerQuestion.text,domain:message.answerQuestion.domain}]
  })
}
export const nursingDialoguePolicy = `主线是基本症状和观察记录。nursingKnowledge.cards是原创观察记录框架，只帮助挑选重点，不是逐项问完的清单，不作为孩子事实或诊断依据。结合memberContext中的真实月龄与相关背景，围绕已说出的表现，从nursingKnowledge.nodes中选择当前最有价值的一问。questionId只能选给定条目id或null；信息足够或家长不知道、没注意、要求先记下来时选null，停止追问。每次只问一个具体可观察问题；普通场景最多三轮，通常两轮即可。不能说“麻烦说清楚点”“为什么重视”“还有什么症状”，不穷举病因，不因字段空缺追完整病史。护理方法帮助选择观察问题，不是诊断；不按月龄推定蛀牙，不用性别编造不同疾病概率。请保留否定、未知、推测和家长转述的区别，图片不能补出看不清的事实。不能把未观察写成没有。可以引导家长描述部位、外观、发生过程、活动影响、已经做的处理与变化。较小且不会表达的孩子使用家长能看到的行为，不要求孩子做医学判断。当前孩子有正在发生的重要呼吸、意识等异常时，emergency提供原文quote和currentChild=true，停止普通追问，不给诊断或治疗，不建议统一等到明天。专业摘要由经过证据验证的事实另行生成，reply保持简短，不复述整段原话，不声称正式保存。` 
