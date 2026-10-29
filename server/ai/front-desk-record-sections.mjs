import {buildFrontDeskFactSources} from './business/front-desk-source-context.mjs'
import {questionTopic,questionAnswerState} from './front-desk-question-progress.mjs'
import {recordKeywords} from '../../shared/front-desk-record-format.mjs'

// Arrange accepted observations only. No inferred normality or diagnosis.
export function frontDeskRecordSections(context,messages) {
  const sources=buildFrontDeskFactSources({facts:context.facts,messages})
  const groups=new Map(),seen=new Set(),overview=[]
  const titles={observation:'具体表现与测量',temperature:'具体表现与测量',location:'具体表现与测量',sensation:'具体表现与测量',appearance:'具体表现与测量',impact:'精神与生活表现',exposure:'发生与变化','bath-comparison':'发生与变化',onset:'发生与变化',handling:'已做处理及反应',uncertain:'待补充与核对'}
  const add=(key,text)=>{const value=text.trim();if(!value||seen.has(value))return;seen.add(value);const title=titles[key.split(':')[0]]??'具体表现与测量';groups.set(title,[...(groups.get(title)??[]),value]);if(key!=='uncertain')overview.push(value)}
  for(const source of sources){
    const topic=source.questionContext?questionTopic(source.questionContext):null
    const key=source.polarity==='unknown'?'uncertain':topic?.key??(/(?:用药|服用|吃了.{0,8}药|涂了|处理|就医|就诊)/u.test(source.text)?'handling':/精神|进食|食欲|睡眠|活动/u.test(source.text)?'impact':/开始|持续|加重|减轻|缓解|反复|昨晚|今早/u.test(source.text)?'onset':'observation')
    add(key,topic?`${topic.label}：${source.text}`:source.text)
  }
  for(const check of context.interview?.checks??[]){
    const message=messages.find(message=>message.id===check.answerMessageId&&message.status==='completed'&&!message.retracted)
    if(!message||message.text!==check.answerText||sources.some(source=>source.originalReferences?.some(ref=>ref.messageId===message.id)))continue
    add(check.state==='uncertain'?'uncertain':check.key,`${check.label}：${message.text}`)
  }
  if(!groups.size)return []
  const body=overview.join('；'),keywords=recordKeywords(body)
  return [{title:'情况概述',text:overview.slice(0,3).join('；')||'已保留目前提供的情况，具体信息仍待补充。'},...(keywords.length?[{title:'关键词',text:keywords.join('、')}]:[]),...['发生与变化','具体表现与测量','精神与生活表现','已做处理及反应','待补充与核对'].filter(title=>groups.has(title)).map(title=>({title,text:groups.get(title).join('\n')}))]
}
export const recordSectionsText=sections=>sections.map(section=>`【${section.title}】\n${section.text}`).join('\n\n')

export function frontDeskInformationProgress(context,messages){
  const result=new Map(),sources=buildFrontDeskFactSources({facts:context.facts,messages})
  const remember=(key,label,state)=>{if(result.get(key)?.state==='answered'&&state!=='answered')return;result.set(key,{key,label,state})}
  for(const source of sources){
    const topic=source.questionContext?questionTopic(source.questionContext):null
    const temperature=topic?.key==='temperature'||/体温|\d{2}(?:\.\d+)?\s*(?:度|℃|°C)/u.test(source.text)
    const state=source.polarity==='unknown'?'uncertain':temperature?questionAnswerState({target:'temperature'},source.text):'answered'
    if(topic)remember(topic.key,topic.label,state)
    else if(temperature)remember('temperature','体温数值',state)
    else if(/精神|进食|食欲|睡眠|活动/u.test(source.text))remember('impact:general','精神与生活表现',state)
    else remember('observation','情况描述',state)
  }
  for(const check of context.interview?.checks??[])if(messages.some(message=>message.id===check.answerMessageId&&message.text===check.answerText&&!message.retracted))remember(check.key,check.label,check.key==='temperature'?questionAnswerState({target:'temperature'},check.answerText):check.state)
  if(sources.some(source=>source.polarity==='affirmed'&&recordKeywords(source.text).some(keyword=>['发热','发烧'].includes(keyword)))&&!result.has('temperature'))remember('temperature','体温数值','missing')
  if(context.interview?.question){const topic=questionTopic(context.interview.question);if(!result.has(topic.key))remember(topic.key,topic.label,'missing')}
  return [...result.values()]
}
