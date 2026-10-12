// Real service acceptance against an explicitly supplied deployment. Uses only
// a newly created synthetic account/member, never existing personal records.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import sharp from 'sharp'
import {chromium,devices} from '@playwright/test'

const base=process.argv[2],label=process.argv[3]??'live'
if(!/^https:\/\//.test(base??''))throw new Error('Pass the verified deployment HTTPS URL')
const output=path.resolve('outputs',`front-desk-${label}`);await mkdir(output,{recursive:true})
const receipts=[],modelResults=[],cookies=new Map();let token,memberId,browser
const stateFile=path.join(output,'synthetic-session.local');let state
try{state=JSON.parse(await readFile(stateFile,'utf8'));if(state.base!==base)state=undefined}catch{}
state??={base,at:Date.now(),textId:randomUUID(),imageId:randomUUID(),voiceId:randomUUID()}
async function api(phase,route,method='GET',body){
 const started=Date.now(),response=await fetch(base+route,{method,headers:{Origin:new URL(base).origin,...(token?{Authorization:`Bearer ${token}`} : {}),...(cookies.size?{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(100000)})
 for(const header of response.headers.getSetCookie()){const pair=header.split(';')[0],index=pair.indexOf('=');if(index>0)cookies.set(pair.slice(0,index),pair.slice(index+1))}
 let data;try{data=await response.json()}catch{data={}}
 receipts.push({phase,status:response.status,code:data.error?.code??null,elapsedMs:Date.now()-started})
 if(!response.ok)throw Object.assign(new Error(`${phase} failed: ${response.status} ${data.error?.code??''}`),{code:data.error?.code})
 return data
}
try{
 await api('health','/api/health')
 const session=state.session??await api('synthetic-registration','/api/auth/register','POST',{nickname:`验收${randomUUID().replaceAll('-','').slice(0,12)}`,password:randomUUID(),idempotencyKey:randomUUID()});token=session.token
 if(state.cookies)for(const pair of state.cookies)cookies.set(...pair)
 state.session=session;state.cookies=[...cookies];await writeFile(stateFile,JSON.stringify(state))
 const member=state.member??await api('synthetic-member','/api/members','POST',{name:'小禾（虚构）',relationship:'child',birthday:'2024-01-01',gender:'female'});memberId=member.id;state.member=member;await writeFile(stateFile,JSON.stringify(state))
 const route=`/api/members/${memberId}/front-desk-record`
 const first=await api('text-dialogue',route,'POST',{id:state.textId,kind:'text',text:'今天吃了半碗粥。',inputAt:state.at})
 modelResults.push(...first.context.messages.filter(m=>m.kind==='assistant').map(m=>({stage:'text',requestId:m.diagnostics?.requestId,model:m.diagnostics?.model,reply:m.text})))
 const picture=await sharp(Buffer.from('<svg width="640" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="400" fill="white"/><circle cx="170" cy="200" r="105" fill="red"/><rect x="360" y="100" width="190" height="200" fill="blue"/></svg>')).png().toBuffer()
 const image={name:'合成红圆蓝方.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${picture.toString('base64')}`,lastModified:state.at+1}
 const visual=await api('image-only-dialogue',route,'POST',{id:state.imageId,kind:'image',text:'',files:[image],inputAt:state.at+1})
 const reply=visual.context.messages.filter(m=>m.kind==='assistant').at(-1)
 modelResults.push({stage:'image',requestId:reply.diagnostics?.requestId,model:reply.diagnostics?.model,reply:reply.text,envelope:reply.diagnostics?.dialogueEnvelope??'object'})
 if(!/(红|圆)/.test(reply.text)||!/(蓝|方|矩形)/.test(reply.text)||/重新录音/.test(reply.text))throw new Error('Vision reply did not describe the actual synthetic geometry')
 const wav=await readFile(path.resolve('outputs/live-record-observation.wav'))
 const audio={name:'synthetic-observation.wav',mimeType:'audio/wav',dataUrl:`data:audio/wav;base64,${wav.toString('base64')}`,lastModified:state.at+2}
 const transcription=state.transcription??await api('real-asr','/api/ai/audio/transcriptions','POST',{memberId,...audio});state.transcription=transcription;await writeFile(stateFile,JSON.stringify(state))
 modelResults.push({stage:'asr',requestId:transcription.diagnostics?.requestId??transcription.requestId,model:transcription.model})
 if(!transcription.transcript?.trim())throw new Error('Real ASR returned no spoken transcript')
 const spoken=await api('voice-transcript-dialogue',route,'POST',{id:state.voiceId,kind:'voice',text:transcription.transcript,voiceFiles:[audio],inputAt:state.at+2})
 const voiceReply=spoken.context.messages.filter(m=>m.kind==='assistant').at(-1)
 modelResults.push({stage:'voice-dialogue',requestId:voiceReply.diagnostics?.requestId,model:voiceReply.diagnostics?.model,reply:voiceReply.text})
 // Choose exactly the model-selected intent; include only this context's sources.
 // The local speech fixture is English. Exercise the requested Chinese mixed
 // record flow by adding its faithful Chinese supplement; do not fabricate ASR.
 state.supplementId??=randomUUID();await writeFile(stateFile,JSON.stringify(state))
 const supplemented=await api('chinese-voice-supplement',route,'POST',{id:state.supplementId,kind:'text',text:'补充刚才的录音：昨天吃了半碗粥，睡了一个小时。',inputAt:state.at+3})
 const supplementReply=supplemented.context.messages.filter(m=>m.kind==='assistant').at(-1);modelResults.push({stage:'chinese-supplement',requestId:supplementReply.diagnostics?.requestId,model:supplementReply.diagnostics?.model})
 const context=supplemented.context,raw=context.messages.filter(m=>m.kind!=='assistant').map(m=>m.text).filter(Boolean).join('\n'),files=context.messages.flatMap(m=>m.files??[]),voiceFiles=context.messages.flatMap(m=>m.voices??[])
 const drafts=`/api/members/${memberId}/ai-drafts`,baseInput={text:raw,task:'record',smartRecord:true,frontDeskRecord:true,confirmOccurrenceTime:true,followUp:false,selectedOccurredAt:new Date().toISOString(),timezone:'Asia/Shanghai'}
 let draft=await api('organization-retain',drafts,'POST',{...baseInput,files,voiceFiles,deferRecognition:true})
 await api('context-checkpoint',`${route}/contexts/${context.id}`,'POST',{draftId:draft.id})
 draft=await api('organization-generate',drafts,'POST',{...baseInput,id:draft.id,version:draft.version})
 modelResults.push({stage:'organization',requestId:draft.generation?.requestId,model:draft.generation?.model,documentPages:draft.pages?.length??0})
 if(!draft.items?.length||draft.state!=='ready')throw new Error('No usable real organization preview')
 for(const item of draft.items)if(!item.timeText)draft=await api('synthetic-time-confirmation',`${drafts}/${draft.id}`,'PATCH',{version:draft.version,itemId:item.id,field:'time',value:'刚才'})
 const saved=await api('formal-save',`${drafts}/${draft.id}/save`,'POST',{version:draft.version,confirmed:true})
 const again=await api('idempotent-save',`${drafts}/${draft.id}/save`,'POST',{version:saved.version,confirmed:true})
 if(JSON.stringify(saved.result)!==JSON.stringify(again.result))throw new Error('Save retry changed formal records')
 await api('saved-checkpoint',`${route}/contexts/${context.id}`,'POST',{draftId:draft.id})
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,headless:true});const browserContext=await browser.newContext({...devices['iPhone SE'],serviceWorkers:'block'})
 await browserContext.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(base).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Lax'})))
 const page=await browserContext.newPage();const failures=[];page.on('pageerror',e=>failures.push(e.name));page.on('response',r=>{if(r.status()>=500)failures.push(`HTTP ${r.status()}`)})
 await page.addInitScript(({token,user,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:user,currentMemberId:memberId,members:[]},version:5}))},{token,user:session.user,memberId})
 await page.goto(base+'/smart-record?source=front-desk');await page.getByRole('heading',{name:'智能记录',exact:true}).waitFor();await page.getByRole('button',{name:'按住说话',exact:true}).waitFor()
 if(await page.getByRole('dialog').count()||await page.getByRole('button',{name:/继续上次|重新开始|收起/}).count())throw new Error('Live page still has retired overlay or recovery choices')
 await page.screenshot({path:path.join(output,'live-opening-iphone-se.png')})
 await page.getByRole('button',{name:'改用文字'}).click();await page.getByLabel('对话输入').fill('把刚才那张红圆和蓝色方块的图片找出来')
 const retrieved=page.waitForResponse(r=>r.url().endsWith('/front-desk-record')&&r.request().method()==='POST');await page.getByRole('button',{name:'发送',exact:true}).click()
 const retrievedResponse=await retrieved,related=await retrievedResponse.json();receipts.push({phase:'live-history-dialogue',status:retrievedResponse.status(),code:related.error?.code??null})
 if(!retrievedResponse.ok())throw new Error('Live history dialogue failed')
 const historicalReply=related.context.messages.filter(m=>m.kind==='assistant').at(-1);modelResults.push({stage:'history-dialogue',requestId:historicalReply.diagnostics?.requestId,model:historicalReply.diagnostics?.model,reply:historicalReply.text})
 await page.getByRole('img',{name:'合成红圆蓝方.png'}).waitFor();await page.screenshot({path:path.join(output,'live-image-history-iphone-se.png')});await browser.close()
 if(failures.length)throw new Error('Live browser errors: '+failures.join(','))
 await writeFile(path.join(output,'acceptance.json'),JSON.stringify({status:'PASS',receipts,modelResults,formalRecords:saved.result.count,device:'background Playwright iPhone SE; physical device not tested'},null,2))
 console.log(JSON.stringify({status:'PASS',output,requests:receipts.length,modelResults:modelResults.map(({reply,...rest})=>rest),formalRecords:saved.result.count}))
}catch(error){await writeFile(path.join(output,'acceptance.json'),JSON.stringify({status:'FAIL',receipts,modelResults,error:{message:error.message,code:error.code}},null,2));console.log(JSON.stringify({status:'FAIL',output,error:error.message,requests:receipts.length}));process.exitCode=1}finally{await browser?.close()}
