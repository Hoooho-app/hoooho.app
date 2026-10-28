import {buildFrontDeskFactSources} from './business/front-desk-source-context.mjs'
import {questionTopic} from './front-desk-question-progress.mjs'

// A source-backed fallback when optional professional organization is pending
// or failed. This is a layout of accepted observations, never a new diagnosis.
export function frontDeskRecordSections(context,messages) {
  const sources=buildFrontDeskFactSources({facts:context.facts,messages})
  const groups=new Map(),seen=new Set()
  const titles={observation:'情况描述',location:'症状部位',sensation:'伴随感受',impact:'日常表现',exposure:'环境与接触','bath-comparison':'变化观察',uncertain:'暂未明确'}
  const add=(key,text)=>{const value=text.trim();if(!value||seen.has(value))return;seen.add(value);const title=titles[key.split(':')[0]]??'补充观察';groups.set(title,[...(groups.get(title)??[]),value])}
  for(const source of sources){
    const topic=source.questionContext?questionTopic(source.questionContext):null
    const key=source.polarity==='unknown'?'uncertain':topic?.key??(/^补充症状部位[：:]/u.test(source.text)?'location':/痒|疼|痛|抓挠/u.test(source.text)?'sensation':/精神|进食|食欲|睡眠|活动/u.test(source.text)?'impact':'observation')
    add(key,topic?`${topic.label}：${source.text}`:source.text)
  }
  for(const check of context.interview?.checks??[]){
    if(!['location','sensation','impact','exposure','bath-comparison'].includes(check.key.split(':')[0]))continue
    const message=messages.find(message=>message.id===check.answerMessageId&&message.status==='completed'&&!message.retracted)
    if(!message||message.text!==check.answerText||sources.some(source=>source.originalReferences?.some(ref=>ref.messageId===message.id)))continue
    add(check.state==='uncertain'?'uncertain':check.key,`${check.label}：${message.text}`)
  }
  return Object.values(titles).filter((title,index,all)=>all.indexOf(title)===index&&groups.has(title)).concat([...groups.keys()].filter(title=>!Object.values(titles).includes(title))).map(title=>({title,text:groups.get(title).join('\n')}))
}
export const recordSectionsText=sections=>sections.map(section=>`【${section.title}】\n${section.text}`).join('\n\n')
