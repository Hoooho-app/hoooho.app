import {nursingSlotKnown,nursingTriggerPresent} from './nursing-slot-evidence.mjs'
import {nursingResponseIntent} from './nursing-response-intent.mjs'
import {nursingObservationContext} from './nursing-observation-context.mjs'
import {NURSING_KNOWLEDGE_VERSION,NURSING_ANSWER_VERSION,nursingMethodSources,nursingKnowledgeNodes as nodes,nursingRecordingKnowledge as recordingKnowledge,nursingMethodEvidence} from './nursing-knowledge.mjs'
export {NURSING_KNOWLEDGE_VERSION,nursingMethodSources}
const option=(label,value)=>({label,value})
const unknown=target=>option('没注意',`暂时没注意${target}，先按已经说过的情况记录。`)
const onset=/(?:今天|今日|昨天|昨日|昨晚|今早|前天|刚才|刚刚|刚量|刚测|上午|下午|凌晨|中午|早晨|午睡起来|最近|这[一二三四五六七八九十两\d]+天|[一二三四五六七八九十两\d]+(?:天|晚|小时|分钟|周)|\d{1,2}月\d{1,2}日|开始时间.*(?:不清楚|不记得)|(?:不知道|不清楚|不记得).{0,4}(?:什么时候|何时))/u
export function nursingMemberContext(member={},now=new Date(),timeZone='Asia/Shanghai') {
  const birthday=member.birthday??member.birthDate
  const date=typeof birthday==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(birthday)?new Date(`${birthday}T00:00:00Z`):null
  const instant=new Date(now)
  const civil=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant).map(p=>[p.type,p.value]))
  let ageMonths=null
  if(date&&Number.isFinite(date.getTime())&&birthday<=`${civil.year}-${civil.month}-${civil.day}`){ageMonths=(Number(civil.year)-date.getUTCFullYear())*12+Number(civil.month)-1-date.getUTCMonth();if(Number(civil.day)<date.getUTCDate())ageMonths--}
  return {ageMonths:ageMonths!==null&&ageMonths>=0?ageMonths:null,gender:['male','female'].includes(member.gender)?member.gender:null}
}

export function assignNursingAnswers(items,observations=[],targetKey='answerObservations') {
 const itemDomains=items.map(item=>new Set([...nursingObservationContext(item.fields.map(f=>f.value).join('\n')).active,...(['sleep','injury'].includes(item.category)?[item.category]:[])]))
 for(const observation of observations){
  const wanted=observation.questionId==='oral-observation'?'oral':observation.domain
  const matches=items.filter((item,index)=>itemDomains[index].has(wanted)||observation.domain==='sleep'&&item.category==='sleep')
  if(matches.length===1)(matches[0][targetKey]??=[]).push(observation)
 }
}
export function nursingKnowledgeFor(text,member={}) {
 const context=nursingObservationContext(text),{domain}=context
 if(!domain)return {version:NURSING_KNOWLEDGE_VERSION,domain:null,nodes:[],cards:[],evidence:[],member}
 let available=nodes.filter(n=>context.active.includes(n.domain)&&nursingTriggerPresent(n,context)&&!nursingSlotKnown(n,context))
 available=available.filter(n=>(n.id!=='stool-change'||!context.variant)&&(n.id!=='injury-function'||/头|脸|手|脚|腿|臂|背|胸|肩|膝|肘|腕|指|趾|额|脐|腹/u.test(context.scoped('injury')))).map(n=>n.id==='resp-effort'&&!/咳|呼吸|喘|憋/u.test(context.scoped('respiratory'))?{...n,priority:80}:n)
 const handling=recordingKnowledge.handlingResponseNode
 const handled=context.clauses.some(c=>c.eligible&&new RegExp(handling.triggerPattern).test(c.text)&&!new RegExp(handling.skipClausePattern).test(c.text))
 if(handled&&!new RegExp(handling.knownPattern).test(context.clauses.filter(c=>c.eligible).map(c=>c.text).join('，'))&&!context.clauses.some(c=>c.eligible&&/(?:后来|之后|后|再).{0,5}(?:没看|没量|没注意|没留意)|(?:没注意|不知道|不清楚).{0,6}(?:变化|反应|效果)/u.test(c.text)))available.push({...handling,domain,known:/$^/})
 available.sort((a,b)=>(b.domain===context.focused?1:0)-(a.domain===context.focused?1:0)||b.priority-a.priority)
 if(!onset.test(context.scoped(domain)))available.push({id:`${domain}-onset`,domain,priority:75,text:domain==='cold'?'这种情况大概从什么时候开始，持续多久了？不记得具体时间也没关系。':'这种变化大约从什么时候开始？不记得具体时间也可以。',options:[option('今天','这种变化从今天开始。'),option('昨天','这种变化从昨天开始。'),option('最近几天','这种变化在最近几天出现，具体起点不清楚。'),unknown('具体开始时间')],sourceIds:['openrn-pediatric-assessment']})
 const relevant=[...new Set([domain,...context.active])].slice(0,2)
 const cards=relevant.map(name=>({domain:name,version:recordingKnowledge.version,reviewStatus:recordingKnowledge.reviewStatus,...recordingKnowledge.domainCards[name]}))
 const caregiverOnly=Number.isInteger(member.ageMonths)&&member.ageMonths<18||context.clauses.some(c=>c.eligible&&/不会说话|不能说话|无法说话|不能表达|无法表达|不会表达/u.test(c.text))
 return {version:NURSING_KNOWLEDGE_VERSION,domain,cards,evidence:nursingMethodEvidence(relevant,context.variant),observations:context.clauses.filter(c=>c.activeDomains.length).slice(0,6).map(c=>({domains:c.activeDomains,quote:c.text,start:c.start,end:c.end})),nodes:available.slice(0,5).map(n=>{
  let wording={}
  if(n.id==='cold-observation'&&caregiverOnly)wording={text:'您摸着孩子哪里觉得凉，或看到他有什么和平时不同的表现？只说实际观察到的就可以。'}
  if(n.id==='skin-sensation')wording=caregiverOnly?{text:'您看到孩子会反复抓挠那里，或在碰到时躲开吗？只记录您观察到的动作就可以。',options:[option('看到抓挠','家长看到孩子反复抓挠那里。'),option('碰到时躲开','家长看到孩子在碰到那里时躲开。'),unknown('皮肤变化时的具体动作')]}:{text:'如果孩子能表达，他说痒或疼吗？也可以只说您看到的抓挠或回避动作。'}
  if(caregiverOnly&&n.id==='pain-location')wording={text:'孩子有没有反复护住、摸向某个部位，或在某个动作时躲开？',options:[option('摸向肚子','家长看到孩子反复摸向肚子。'),option('摸向嘴部','家长看到孩子反复摸向嘴部。'),unknown('孩子是否护住或摸向某个部位')]}
  if(caregiverOnly&&n.id==='oral-observation')wording={options:n.options.filter(o=>o.label!=='孩子说嘴疼')}
  if(caregiverOnly)wording.options=(wording.options??n.options).filter(o=>!/孩子(?:自己)?说|孩子自述/u.test(o.value))
  return {id:n.id,domain:n.domain,priority:n.priority,text:n.text,options:n.options,...wording,slot:n.slot??n.id,answerKind:n.answerKind??'choice',sourceIds:n.sourceIds??['openrn-pediatric-assessment']}
 }),member}
}

export const stopsNursingInterview=text=>nursingResponseIntent(text).stop
export function nursingInterview({text,latestText,previous,requestedQuestionId,member,urgent=false}) {
  const knowledge=nursingKnowledgeFor(text,member),asked=[...new Set(previous?.askedQuestionIds??[])]
  const stop=stopsNursingInterview(latestText??text)
  const available=knowledge.nodes.filter(n=>!asked.includes(n.id))
  // A broad cold observation still needs its source and course clarified. A
  // supplier's null choice must not skip these gaps; explicit user stops win.
  const coldGap=knowledge.domain==='cold'&&available.some(n=>['cold-observation','cold-onset'].includes(n.id))&&asked.length<2
  const explicitReady=requestedQuestionId===null&&!coldGap
  const reason=urgent?'important_observation':stop?'user_finished':previous?.status==='ready'&&!(coldGap&&!previous.domain&&asked.length===0)?'already_finished':asked.length>=3?'question_budget':explicitReady?'sufficient_information':asked.length>=2&&(available[0]?.priority??0)<90?'enough_for_record':!available.length?'no_relevant_gap':null
  const question=reason?null:available.find(n=>n.id===requestedQuestionId)??available[0]??null
  return {version:NURSING_KNOWLEDGE_VERSION,status:urgent?'urgent':question?'asking':'ready',domain:question?.domain??knowledge.domain,turnCount:question?asked.length+1:asked.length,askedQuestionIds:question?[...asked,question.id]:asked,stopReason:question?null:reason??'sufficient_information',question:question?{id:question.id,text:question.text,options:question.options,sourceIds:question.sourceIds}:null}
}

// Only unambiguous short replies to a persisted question can be expanded.
// Other utterances remain literal source text for the normal extraction path.
export function interpretNursingAnswer(questionId,answer) {
  if(typeof questionId!=='string')return null
  const raw=String(answer??'').trim().replace(/[。！!，,\s]+$/u,'')
  const unknownTargets={'skin-location':'变化的具体部位','skin-appearance':'变化的具体外观','skin-sensation':'孩子的具体感受或相关动作','resp-effort':'目前呼吸是否明显费力','cough-pattern':'咳嗽的规律','fever-measurement':'是否已测体温','fever-state':'精神和反应的变化','stool-count':'稀便的具体次数','bowel-urine':'这段时间尿量的变化','vomit-course':'吐与吃喝的先后经过','pain-location':'不适的具体部位','pain-impact':'不适对日常状态的影响','urinary-change':'尿的次数、量或颜色变化','injury-function':'受伤部位的活动情况','injury-course':'受伤经过','sleep-awakening':'哭闹时是否清醒','oral-observation':'是否存在口腔不适','sleep-consolation':'安抚后的变化','behaviour-change':'具体行为变化','handling-response':'处理后的变化'}
  if(nursingResponseIntent(raw).kind==='unknown'){
    const target=unknownTargets[questionId]??nodes.find(n=>n.id===questionId)?.options?.find(o=>o.label==='没注意')?.value.match(/^暂时没注意([^，。]+)，/)?.[1]??(questionId.endsWith('-onset')?'具体开始时间':null)
    return target?{version:NURSING_ANSWER_VERSION,text:`${target}暂不清楚`,polarity:'unknown'}:null
  }
  if(questionId.endsWith('-onset')&&onset.test(raw))return {version:NURSING_ANSWER_VERSION,text:raw,polarity:'literal'}
  const choice=nodes.find(n=>n.id===questionId)?.options?.find(o=>o.value.replace(/[。！!，,\s]+$/u,'')===raw)
  if(choice&&choice.label!=='没注意')return {version:NURSING_ANSWER_VERSION,text:raw,polarity:'literal'}
  const polarity=/^(?:没有|没|没有啊|没看到|没发现|不会)$/.test(raw)?'no':/^(?:有|有的|有啊|是|是的|会)$/.test(raw)?'yes':null
  const meanings={
    'resp-effort':{yes:'家长观察到孩子呼吸明显费力',no:'家长未见孩子有明显呼吸费力'},
    'bowel-urine':{yes:'家长观察尿量或尿湿尿布情况有变化，具体变化尚未说明',no:'家长暂未发现尿量或尿湿尿布情况有明显变化'},
    'urinary-change':{yes:'家长观察尿的次数、量或颜色有变化，具体项目尚未说明',no:'家长暂未发现尿的次数、量或颜色有明显变化'},
    'pain-impact':{yes:'家长观察本次不适影响日常状态，具体方面尚未说明',no:'家长暂未发现本次不适明显影响吃喝、活动或入睡'},
    'oral-observation':{yes:'家长观察进食或刷牙时有躲避或疼痛表现，具体表现尚未明确',no:'家长暂未见进食或刷牙时躲避或疼痛表现'},
    'sleep-consolation':{yes:'家长称安抚后可平静或再次入睡，具体情况尚未明确',no:'家长称安抚后仍难以平静或再次入睡'}
  }
  return polarity&&meanings[questionId]?{version:NURSING_ANSWER_VERSION,text:meanings[questionId][polarity],polarity}:null
}

export function nursingAnswerObservations(messages=[]) {
  const superseding={ 'resp-effort':/呼吸|喘|憋/,'bowel-urine':/尿|排尿/,'urinary-change':/尿|排尿/,'pain-impact':/吃|喝|睡|玩|活动/,'oral-observation':/嘴|口腔|牙|刷|吃东西/,'sleep-consolation':/安抚|抱|平静|睡/ }
  return messages.flatMap((message,index)=>{
    if(!message.answerTo||!message.answerQuestion||message.kind==='assistant'||message.status!=='completed')return []
    const interpretation=interpretNursingAnswer(message.answerTo.questionId,message.text)
    if(!interpretation)return []
    const relevant=superseding[message.answerTo.questionId]??nodes.find(n=>n.id===message.answerTo.questionId)?.known??(message.answerTo.questionId.endsWith('-onset')?onset:null)
    if(messages.slice(index+1).some((m,laterIndex)=>{
      if(m.kind==='assistant'||m.status!=='completed')return false
      const context=nursingObservationContext(m.text)
      const genericCorrection=/说错|记错|更正|刚才.{0,8}(?:不对|有误)/u.test(m.text)&&!context.active.length&&!/日期|时间|几点|哪天|次数|数量|剂量|药名|部位|位置/u.test(m.text)&&!messages.slice(index+1,index+1+laterIndex).some(other=>other.answerTo&&other.kind!=='assistant')
      return context.clauses.some(c=>c.eligible&&(relevant?.test(c.text)||genericCorrection))
    }))return []
    return [{...interpretation,sourceMessageId:message.id,answerText:message.text,questionId:message.answerTo.questionId,questionText:message.answerQuestion.text,domain:message.answerQuestion.domain,knowledgeVersion:message.answerQuestion.knowledgeVersion??'observation-recording-20261024-v1'}]
  })
}
export const nursingDialoguePolicy = `主线是基本症状和观察记录。nursingKnowledge.cards是原创观察记录框架，只帮助挑选重点，不是逐项问完的清单，不作为孩子事实或诊断依据。结合memberContext中的真实月龄与相关背景，围绕已说出的表现，从nursingKnowledge.nodes中选择当前最有价值的一问。questionId只能选给定条目id或null；信息足够或家长不知道、没注意、要求先记下来时选null，停止追问。每次只问一个具体可观察问题；普通场景最多三轮，通常两轮即可。不能说“麻烦说清楚点”“为什么重视”“还有什么症状”，不穷举病因，不因字段空缺追完整病史。护理方法帮助选择观察问题，不是诊断；不按月龄推定蛀牙，不用性别编造不同疾病概率。请保留否定、未知、推测和家长转述的区别，图片不能补出看不清的事实。不能把未观察写成没有。可以引导家长描述部位、外观、发生过程、活动影响、已经做的处理与变化。较小且不会表达的孩子使用家长能看到的行为，不要求孩子做医学判断。当前孩子有正在发生的重要呼吸、意识等异常时，emergency提供原文quote和currentChild=true，停止普通追问，不给诊断或治疗，不建议统一等到明天。专业摘要由经过证据验证的事实另行生成，reply保持简短，不复述整段原话，不声称正式保存。` 
