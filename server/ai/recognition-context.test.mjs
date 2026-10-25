import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {RecognitionJobs} from './recognition-jobs.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {HealthEventService} from '../events/health-event-service.mjs'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {AIBusinessService} from './business/service.mjs'
async function until(fn){for(let i=0;i<300;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,10))}throw new Error('Timed out waiting for task')}
test('recognition persists explicit context identity and saved continuation does not re-extract old facts',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-recognition-context-'))
 const members=new FamilyMemberRepository(directory),member=await members.create({accountId:'synthetic',name:'虚构测试',relationship:'child'}),events=new HealthEventService({dataDirectory:directory})
 const model={provider:{name:'test',model:'strict-v1'},structured:async input=>{const source=JSON.parse(input.input).sources[0];return {value:{items:[{category:'symptom',title:'观察记录',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:source.text,quote:source.text,sourceId:source.id,page:source.page}]}]},diagnostics:{}}}}
 const business=new AIBusinessService({dataDirectory:directory,model,logger:{info(){}}})
 const front=new FrontDeskRecord({dataDirectory:directory,events,business,model:{structured:async()=>({value:{reply:'收到。',contextId:'new',action:'record',questionId:null,emergency:{currentChild:false,quote:''}},diagnostics:{}})}})
 const jobs=new RecognitionJobs({dataDirectory:directory,events,business,frontDesk:front,audio:{},autoStart:false,logger:{info(){},warn(){}}})
 business.assertRecognitionCurrent=d=>jobs.assertCurrent(d)
 t.after(async()=>{await jobs.close();await until(()=>!jobs.active.size);jobs.db.close();await rm(directory,{recursive:true,force:true})})
 const first=await front.submit('synthetic',member.id,{id:'original',kind:'text',text:'昨天脸颊发红'})
 await front.store.update(data=>({...data,contexts:data.contexts.map(c=>c.id===first.context.id?{...c,saved:true}:c)}))
 const input={id:'task-new',mode:'front',input:{id:'new-message',kind:'text',text:'今天颜色淡了一些',contextId:first.context.id},options:{task:'record',smartRecord:true,followUp:false}}
 await jobs.submit('synthetic',member.id,input)
 const ready=await until(async()=>{const value=await jobs.get('synthetic',member.id,'task-new');return ['ready','failed'].includes(value.state)&&value})
 assert.equal(ready.state,'ready',JSON.stringify(ready.error))
 assert.equal(ready.review.inputText,'今天颜色淡了一些')
 assert.notEqual(ready.frontDesk.context.id,first.context.id)
 assert.equal(ready.frontDesk.context.conversationId,first.context.id)
 assert.equal(jobs.raw('task-new').inputs[0].contextId,first.context.id)
 await assert.rejects(()=>jobs.submit('synthetic',member.id,{...input,input:{...input.input,contextId:ready.frontDesk.context.id}}),{code:'RECOGNITION_INPUT_CONFLICT'})
 await assert.rejects(()=>jobs.submit('synthetic',member.id,{...input,id:'bad-mode',mode:'record'}),{code:'RECOGNITION_CONTEXT_INVALID'})
 assert.equal((await front.history('synthetic',member.id)).items.length,1)
})
