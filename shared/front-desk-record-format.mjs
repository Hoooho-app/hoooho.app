import {clinicalAssertions,clinicalContext} from './clinical-evidence.mjs'

export const recordDetailTitles=['发生与变化','具体表现与测量','精神与生活表现','已做处理及反应','原始资料']
const aliases={'情况描述':'情况概述','主要症状':'情况概述','症状部位':'具体表现与测量','伴随感受':'具体表现与测量','症状外观':'具体表现与测量','日常表现':'精神与生活表现','环境与接触':'发生与变化','变化观察':'发生与变化','补充观察':'具体表现与测量','暂未明确':'待补充与核对'}

/** Display-only projection. Literal facts stay intact in the saved text. */
export function recordKeywords(text){
  const findings=[...clinicalAssertions(text),...[...text.matchAll(/红点|红斑|肚子胀|胃胀|手脚凉/gu)].map(match=>({text:match[0],...clinicalContext(text,match.index,match.index+match[0].length)}))].filter(value=>value.polarity==='affirmed'&&value.subject==='current'&&value.temporality==='current').map(value=>value.text)
  const measured=[...text.matchAll(/(?:体温[：:\s]*)?\d{2}(?:\.\d+)?\s*(?:℃|°C|摄氏度|度)/gu)].map(match=>match[0])
  return [...new Set([...findings,...measured])].slice(0,8)
}

export function recordReading(text,keywords=[]){
  const parts=String(text??'').split(/(?:^|\n)【([^】\n]{1,40})】\s*\n/u)
  const sections=[]
  const add=(title,value)=>{const content=value.trim();if(!content)return;const name=aliases[title]??title;const existing=sections.find(section=>section.title===name);if(existing)existing.text+='\n'+content;else sections.push({title:name,text:content})}
  if(parts[0].trim())add('情况概述',parts[0])
  for(let i=1;i<parts.length;i+=2)add(parts[i],parts[i+1]??'')
  const explicit=sections.find(section=>section.title==='关键词')
  const body=sections.filter(section=>!['关键词','原始资料','待补充与核对'].includes(section.title)).map(section=>section.text).join('\n')
  const derived=recordKeywords(body)
  const requested=explicit?explicit.text.split(/[、，,\n]/u).map(value=>value.trim()).filter(Boolean):keywords
  const tags=[...new Set([...requested.filter(value=>value&&body.includes(value)&&(derived.includes(value)||!clinicalAssertions(value).length)),...derived])].slice(0,8)
  const overview=sections.find(section=>section.title==='情况概述')?.text??sections.filter(section=>!['关键词','原始资料','待补充与核对'].includes(section.title)).map(section=>section.text).slice(0,2).join('；')
  return {overview:overview||'附件记录',keywords:tags,details:sections.filter(section=>!['情况概述','关键词'].includes(section.title))}
}

/** Refresh only the derived keyword block after a user edits a headed record. */
export function refreshRecordKeywords(text){
  if(!text.includes('【关键词】'))return text
  const tags=recordReading(text).keywords
  return text.replace(/【关键词】\s*\n[\s\S]*?(?=\n【|$)/u,tags.length?`【关键词】\n${tags.join('、')}\n`:'').trim()
}
