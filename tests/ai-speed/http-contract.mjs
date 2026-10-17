import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
const source=process.env.HOOOHO_SOURCE_ROOT??process.cwd(),base=process.env.HOOOHO_HTTP_BASE??'http://127.0.0.1:45485',control=process.env.HOOOHO_FIXTURE_CONTROL??'http://127.0.0.1:45899'
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(control).hostname,'127.0.0.1')
const {TokenService}=await import(pathToFileURL(path.join(source,'server/auth/token-service.mjs')))
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),auth={Authorization:`Bearer ${token}`}
const findings=[],delay=ms=>new Promise(r=>setTimeout(r,ms)),active=j=>['queued','running','publishing'].includes(j.state)
async function api(url,{method='GET',body,member,expected=200,signal}={}){
 const response=await fetch(new URL(url,base),{method,headers:{...auth,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(member?{'X-Hoooho-Member-Id':member}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:signal??AbortSignal.timeout(12000)})
 let data;try{data=await response.json()}catch{data=null}
 assert.equal(response.status,expected,`${method} ${url}: ${JSON.stringify(data)}`);return data
}
async function ctl(url,body){const response=await fetch(new URL(url,control),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert.ok(response.ok);return response.json()}
const jobPath=(member,id)=>`/api/members/${member}/recognition-jobs/${id}`
async function until(fn,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){const result=await fn();if(result)return result;await delay(20)}throw new Error('Timed out waiting for HTTP contract')}
async function ready(member,id,previous){let current=previous;for(let n=0;n<60;n++){const query=active(current)?`?afterSeq=${current.seq}&waitMs=1000`:'';current=await api(jobPath(member,id)+query);if(!active(current)){assert.ok(['ready','needs_review'].includes(current.state),JSON.stringify(current.error));return current}}throw new Error('Task did not complete')}
await api('/api/health');await ctl('/success');await ctl('/draft-data',{});await ctl('/delay?ms=4000')
const pausedId=randomUUID(),ack=await api('/api/members/empty-child/recognition-jobs',{method:'POST',expected:202,body:{id:pausedId,mode:'front',input:{id:randomUUID(),kind:'text',text:'脸颊发红'},options:{task:'record',smartRecord:true,selectedOccurredAt:new Date().toISOString()}}})
assert.equal(ack.inputRevision,1)
const responding=await until(async()=>{const j=await api(jobPath('empty-child',pausedId));return j.stage==='responding'&&j})
let pollResolved=false;const polling=api(jobPath('empty-child',pausedId)+`?afterSeq=${responding.seq}&waitMs=25000`).then(j=>{pollResolved=true;return j})
await delay(100);assert.equal(pollResolved,false,'long poll must actually wait before a state change')
let started=Date.now();await api(jobPath('child-a',pausedId)+'?afterSeq=0&waitMs=25000',{expected:404});const foreignMs=Date.now()-started
started=Date.now();const paused=await api(jobPath('empty-child',pausedId)+'/commands',{method:'POST',body:{id:randomUUID(),type:'pause'}}),pauseMs=Date.now()-started
assert.equal(paused.state,'paused');assert.ok(pauseMs<1500,`pause blocked by poll: ${pauseMs}ms`)
const polled=await polling;assert.equal(polled.state,'paused');assert.ok(polled.seq>responding.seq)
findings.push({check:'真实HTTP长轮询等待时，同账户取消与跨成员隔离',passed:true,pauseMs,foreign404Ms:foreignMs,pollState:polled.state})
await api(jobPath('empty-child',pausedId)+'/commands',{method:'POST',body:{id:randomUUID(),type:'discard'}})
await ctl('/delay?ms=20')
const finalId=randomUUID(),raw='今天没有呕吐',frontAck=await api('/api/members/empty-child/recognition-jobs',{method:'POST',expected:202,body:{id:finalId,mode:'front',input:{id:randomUUID(),kind:'text',text:raw},options:{task:'record',smartRecord:true,selectedOccurredAt:new Date().toISOString()}}})
const final=await ready('empty-child',finalId,frontAck)
assert.equal(final.state,'ready');assert.equal(final.frontDesk.context.draftId,final.review.id);assert.equal(final.frontDesk.context.review.version,final.review.version);assert.equal(final.resultRevision,final.inputRevision)
assert.equal(JSON.stringify(final.frontDesk).includes('data:'),false)
findings.push({check:'最终HTTP任务响应嵌入同版context及review，无需二次GET',passed:true,version:final.review.version,inputRevision:final.inputRevision})
const draft=final.review,itemId=draft.items[0].id,draftUrl=`/api/members/empty-child/ai-drafts/${draft.id}`
const statusBefore=(await ctl('/status')).calls
const patched=await api(draftUrl,{method:'PATCH',body:{version:draft.version,changes:[{itemId,field:'title',value:'合成手工核对观察'},{itemId,field:'symptom',value:raw}]}})
assert.equal(patched.version,draft.version+1);assert.equal(patched.items[0].title,'合成手工核对观察');assert.equal(patched.items[0].fields.find(f=>f.name==='symptom').value,raw)
await api(draftUrl,{method:'PATCH',expected:404,body:{version:patched.version,changes:[{itemId,field:'title',value:'这个标题必须回滚'},{itemId:'missing-item',field:'title',value:'触发失败'}]}})
const rolledBack=await api(draftUrl);assert.equal(rolledBack.version,patched.version);assert.equal(rolledBack.items[0].title,'合成手工核对观察')
await api(draftUrl,{method:'PATCH',expected:409,body:{version:draft.version,changes:[{itemId,field:'title',value:'旧版本不得覆盖'}]}})
const saved=await api(draftUrl+'/save',{method:'POST',body:{version:patched.version,confirmed:true}});assert.equal(saved.state,'saved');assert.ok(saved.result.records.length)
const repeated=await api(draftUrl+'/save',{method:'POST',body:{version:patched.version,confirmed:true}});assert.deepEqual(repeated.result,saved.result)
const savedJob=await api(jobPath('empty-child',finalId));assert.equal(savedJob.review.state,'saved');assert.equal(savedJob.frontDesk.context.review.state,'saved')
const rows=await api(`/api/events/${saved.result.records[0].eventId}/records`);assert.equal(rows.find(r=>r.id===saved.result.records[0].recordId).aiProvenance.confirmed,true)
assert.equal((await ctl('/status')).calls,statusBefore)
findings.push({check:'批量changes一次version提交、整批失败回滚、旧版拒绝、确认保存及幂等且零额外模型调用',passed:true,oldVersion:draft.version,newVersion:patched.version,savedRecords:saved.result.records.length})
const image=Buffer.from((await readFile(path.join(source,'server/ai/business/fixtures/synthetic-report.png.b64'),'utf8')).trim(),'base64'),photoDraft='http-photo-'+randomUUID(),beforePhotoCalls=(await ctl('/status')).calls
const photo=await api(`/api/quick-records/${photoDraft}/photos`,{method:'POST',expected:201,body:{memberId:'child-a',name:'合成已有原件.png',mimeType:'image/png',dataUrl:'data:image/png;base64,'+image.toString('base64'),sortOrder:0}})
const reference={quickRecordDraftId:photoDraft,photoId:photo.id}
await api('/api/members/empty-child/recognition-assets',{method:'POST',expected:404,body:reference,member:'empty-child'})
const asset=await api('/api/members/child-a/recognition-assets',{method:'POST',expected:201,body:reference,member:'child-a'})
const reusedAgain=await api('/api/members/child-a/recognition-assets',{method:'POST',expected:201,body:reference,member:'child-a'});assert.equal(reusedAgain.id,asset.id);assert.equal(asset.bytes,image.length)
assert.equal((await ctl('/status')).calls,beforePhotoCalls)
await ctl('/draft-data',{ocrText:'脸颊发红'})
const imageId=randomUUID(),imageAck=await api('/api/members/child-a/recognition-jobs',{method:'POST',expected:202,body:{id:imageId,mode:'structured',scopeKey:'http-photo-reuse',input:{id:randomUUID(),kind:'image',text:'',assetIds:[asset.id]},options:{task:'record'}}})
const imageReady=await ready('child-a',imageId,imageAck);assert.equal(imageReady.review.sources[0].text,'脸颊发红');assert.equal(imageReady.review.pages[0].name,photo.name)
const imageCalls=(await ctl('/status')).calls-beforePhotoCalls;assert.equal(imageCalls,2)
const consumed=await api('/api/quick-records',{method:'POST',expected:201,body:{memberId:'child-a',content:'合成图片原件转存',rawText:'合成图片原件转存',occurredAt:new Date().toISOString(),inputChannel:'text',idempotencyKey:randomUUID(),title:'合成HTTP图片验收',photoDraftId:photoDraft,photoIds:[photo.id]}})
assert.equal(consumed.photoCount,1)
await api('/api/members/child-a/recognition-assets',{method:'POST',expected:404,body:reference,member:'child-a'})
findings.push({check:'quickRecordPhoto经JSON引用复用recognition资产并完成OCR+抽取，跨成员/已消费原件拒绝',passed:true,referenceRequestBytes:Buffer.byteLength(JSON.stringify(reference)),originalBytes:image.length,sameAssetId:true,modelCalls:imageCalls})
await ctl('/draft-data',{});await ctl('/delay?ms=400')
const report={at:new Date().toISOString(),environment:'isolated HTTP fixture; mock provider only; no browser',base,findings}
if(process.env.HOOOHO_HTTP_REPORT)await writeFile(process.env.HOOOHO_HTTP_REPORT,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
