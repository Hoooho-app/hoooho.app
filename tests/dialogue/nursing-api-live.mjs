// Real-provider acceptance with isolated synthetic data; no browser TLS override.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
const base=process.argv[2],expectedCommit=process.argv[3],out='outputs/nursing-record-production'
assert.equal(base,'https://hoooho.com');assert.match(expectedCommit??'',/^[a-f0-9]{40}$/)
await mkdir(out,{recursive:true})
let token;const cookies=new Map(),members=[],checks=[],samples=[]
const result={syntheticOnly:true,expectedCommit,checks,samples,productionBrowser:'BLOCKED_BY_TEST_ENVIRONMENT_CONNECTION',physicalIPhone:'NOT_VERIFIED'}
async function api(route,method='GET',body){
 const r=await fetch(base+route,{method,headers:{Origin:base,...(token?{Authorization:`Bearer ${token}`} :{}),...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)})
 for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],i=pair.indexOf('=');if(i>0)cookies.set(pair.slice(0,i),pair.slice(i+1))}
 const v=await r.json();assert.ok(r.ok,`${method} ${route}: ${r.status} ${v.error?.code??''}`);return v
}
const raw=context=>context.messages.filter(m=>m.kind!=='assistant'&&m.status==='completed').map(m=>m.text).join('\n')
async function member(name){const m=await api('/api/members','POST',{name,relationship:'child',birthday:'2024-01-01'});members.push(m.id);return m.id}
async function front(id,text,answerTo){return api(`/api/members/${id}/front-desk-record`,'POST',{id:randomUUID(),kind:'text',text,...(answerTo?{answerTo}:{})})}
async function draft(id,context){return api(`/api/members/${id}/ai-drafts`,'POST',{text:raw(context),smartRecord:true,frontDeskRecord:true,frontContextId:context.id})}
try{
 assert.equal((await api('/api/health')).status,'ok')
 const html=await(await fetch(base)).text(),entry=html.match(/src="([^" ]+\/index-[^" ]+\.js)"/)?.[1];assert.ok(entry)
 assert.ok((await(await fetch(base+entry)).text()).includes(expectedCommit));checks.push('health and deployed frontend commit')
 const session=await api('/api/auth/register','POST',{nickname:`护理验收${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token
 const skin=await member('皮肤观察验收（虚构）')
 let turn=await front(skin,'今天早上身上有点东西，老挠');assert.equal(turn.context.interview.question?.id,'skin-location');checks.push('real model asks specific body-location question')
 assert.equal(turn.context.interview.version,'observation-questions-20261025-v2');checks.push('deployed observation knowledge version v2')
 turn=await front(skin,'变化在四肢。',{contextId:turn.context.id,questionId:'skin-location'})
 if(turn.context.interview.status==='asking')turn=await front(skin,'没注意',{contextId:turn.context.id,questionId:turn.context.interview.question.id})
 assert.notEqual(turn.context.interview.status,'asking');assert.ok(turn.context.interview.turnCount<=3)
 const preview=await draft(skin,turn.context);assert.ok(preview.items.length);assert.ok(preview.items.every(i=>i.professionalSummary?.text))
 samples.push({case:'skin',summary:preview.items.map(i=>i.professionalSummary.text)});result.model=preview.generation
 const saved=await api(`/api/members/${skin}/ai-drafts/${preview.id}/save`,'POST',{version:preview.version,confirmed:true})
 for(const ref of saved.result.records){const records=await api(`/api/events/${ref.eventId}/records`),record=records.find(r=>r.id===ref.recordId);assert.equal(record.content,record.aiProvenance.professionalSummary.text);assert.equal(record.sourceText,raw(turn.context))}
 const replay=await api(`/api/members/${skin}/ai-drafts/${preview.id}/save`,'POST',{version:saved.version,confirmed:true});assert.deepEqual(replay.result,saved.result)
 checks.push('unknown stops, professional summary persists with originals, save is idempotent')
 const cough=await member('咳嗽观察验收（虚构）')
 turn=await front(cough,'孩子昨晚开始咳嗽');assert.equal(turn.context.interview.question?.id,'resp-effort')
 const binding={contextId:turn.context.id,questionId:'resp-effort'}
 turn=await front(cough,'没有',binding);assert.equal(turn.context.id,binding.contextId)
 const second=await draft(cough,turn.context),summary=second.items.map(i=>i.professionalSummary?.text??'').join('\n')
 assert.match(summary,/家长未见孩子有明显呼吸费力/);assert.doesNotMatch(summary,/没有呕吐|已排除|呼吸正常|医生意见：(?:；|。|$)/)
 samples.push({case:'cough',summary});checks.push('short no qualifies only its bound breathing-effort question')
 const sleep=await api(`/api/members/${cough}/ai-drafts`,'POST',{text:'这两晚孩子睡觉时哭闹，安抚后能继续睡，没有观察到醒来。',smartRecord:true,frontDeskRecord:true})
 assert.ok(sleep.items.some(i=>i.category==='sleep'));assert.ok(!sleep.items.some(i=>i.category==='symptom'));assert.ok(!sleep.items.some(i=>i.fields.some(f=>/夜醒/.test(f.value))))
 assert.ok(!sleep.items.some(i=>/入睡：没有观察|醒来：没有观察/.test(i.professionalSummary?.text??'')))
 samples.push({case:'sleep',summary:sleep.items.map(i=>i.professionalSummary?.text??i.title)});checks.push('sleep crying stays sleep without invented awakening or pain')
 for(const c of [
  {name:'硬便观察验收（虚构）',text:'孩子今天便便硬硬的小颗粒，拉的时候很用力。',domain:'bowel',forbidden:['stool-count','bowel-urine','stool-last-time'],facts:/颗粒|用力/,noFacts:/排稀便|肠梗阻/},
  {name:'鼻部观察验收（虚构）',text:'孩子今天鼻子堵，没有咳嗽。',domain:'respiratory',forbidden:['cough-pattern','cough-impact'],facts:/鼻|堵/,noFacts:/鼻窦炎|肺炎/},
  {name:'行为观察验收（虚构）',text:'孩子今天有点不对劲。',domain:'behaviour',required:'behaviour-change',forbidden:['pain-location','sleep-awakening'],facts:/不对劲/,noFacts:/确诊|发育迟缓/},
  {name:'耳部观察验收（虚构）',text:'孩子今天老扯右耳朵，没有说疼。',domain:'ear',forbidden:['ear-side','pain-location'],facts:/右耳/,noFacts:/中耳炎|已排除/}
 ]){
  const id=await member(c.name),response=await front(id,c.text),interview=response.context.interview
  assert.equal(interview.domain,c.domain,c.name)
  assert.ok(!c.forbidden.includes(interview.question?.id),c.name)
  if(c.required)assert.equal(interview.question?.id,c.required,c.name)
  const review=await draft(id,response.context),description=review.items.map(i=>i.professionalSummary?.text??'').join('\n')
  assert.match(description,c.facts,c.name);assert.doesNotMatch(description,c.noFacts,c.name)
  samples.push({case:c.name,question:interview.question?.text??null,summary:description})
 }
 checks.push('real-provider hard-stool, nasal, vague-behaviour and ear observations stay focused and factual')
 result.status='PASS'
}catch(e){result.status='FAILED';result.message=e.message;process.exitCode=1}
finally{
 result.cleanup=[]
 for(const id of members)await api(`/api/members/${id}`,'DELETE').then(()=>result.cleanup.push('synthetic member removed')).catch(()=>result.cleanup.push('requires synthetic cleanup follow-up'))
 await writeFile(`${out}/api-acceptance.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}
