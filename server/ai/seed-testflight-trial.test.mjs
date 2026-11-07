import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeedTestflightTrial } from './seed-testflight-trial.mjs'

const owner={id:'real-account-must-not-be-sent',hooohoId:'H7P52R8W',email:'owner@example.test'}
const env={NODE_ENV:'production',RAILWAY_ENVIRONMENT_ID:'existing-service',HOOOHO_SEED_TRIAL_HOOOHO_ID:owner.hooohoId,HOOOHO_SEED_TRIAL_API_KEY:'fixture-key'}
const requestedAction={type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''}
const mockReply=(body,index)=>{
  const x=JSON.parse(body.messages[1].content[0].text)
  const source=(quote)=>({messageId:'seed-trial-first',attachmentId:null,quote})
  const subject={kind:'current',memberId:x.selectedMember.id,label:null,sources:[source('孩子')]}
  const changes=index===1?[
    {type:'add',targetId:null,text:'昨晚八点咳嗽三次',scope:'record',polarity:'affirmed',subject,sources:[source('昨晚八点咳嗽三次')]},
    {type:'add',targetId:null,text:'没有发烧',scope:'record',polarity:'negated',subject,sources:[source('没有发烧')]}
  ]:[]
  return {reply:index===1?'咳嗽时有没有喘或呼吸费力？':'发生时间按前天晚上八点，其他观察不变。',contextId:index===1?'new':x.conversation.activeContextId,
    responseMode:'record',taskRelation:index===1?'new':'continue',subject,recordChanges:changes,
    nextQuestion:index===1?{id:null,text:'咳嗽时有没有喘或呼吸费力？',target:'breathing',sourceMessageId:'seed-trial-first'}:null,
    requestedAction,uncertainties:[],emergency:{currentChild:false,quote:''},diagnosisRequested:false}
}

test('only configured account can see the trial or send the fixed case; invalid inputs do not call Ark',async()=>{
  let calls=0
  const service=createSeedTestflightTrial({env,fetchImpl:async()=>{calls++;throw new Error()}})
  assert.equal(service.status(owner).available,true)
  for(const user of [null,{...owner,hooohoId:'wrong'},{...owner,guest:true},{...owner,mergedInto:'elsewhere'}]){
    assert.deepEqual(service.status(user),{available:false})
    await assert.rejects(service.run(user,{}),{status:404})
  }
  assert.deepEqual(createSeedTestflightTrial({env:{...env,HOOOHO_SEED_TRIAL_API_KEY:''}}).status(owner),{available:false})
  await assert.rejects(service.run(owner,{text:'任意输入不得外传'}),{status:400,code:'SEED_TRIAL_FIXED_CASE'})
  assert.equal(calls,0)
})

test('executes the real front-desk flow with only disposable synthetic records and verifies corrected time',async()=>{
  let calls=0
  const trial=createSeedTestflightTrial({env,fetchImpl:async(url,init)=>{
    assert.equal(url,'https://ark.cn-beijing.volces.com/api/v3/chat/completions')
    assert.doesNotMatch(init.body,/real-account-must-not-be-sent|owner@example\.test|H7P52R8W|fixture-key/)
    const body=JSON.parse(init.body)
    assert.equal(body.model,'doubao-seed-2-1-pro-260915')
    assert.equal(body.response_format.type,'json_schema')
    assert.match(body.messages[1].content[0].text,/seed-trial-(?:first|correction)/)
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(mockReply(body,++calls))}}]})
  }})
  const result=await trial.run(owner,{})
  assert.equal(calls,2)
  assert.equal(result.replies.length,2)
  assert.equal(result.card.generated,true)
  assert.equal(result.card.occurredAt,'2026-11-05T12:00:00.000Z')
  assert.match(result.card.text,/没有发烧/)
  assert.doesNotMatch(JSON.stringify(result),/real-account-must-not-be-sent|fixture-key|recordId|memberId/)
  await assert.rejects(trial.run(owner,{}),{status:429})
  assert.equal(calls,2)
})

test('provider failure is safe and has no implicit retry or production fallback',async()=>{
  let calls=0
  const service=createSeedTestflightTrial({env,fetchImpl:async()=>{
    calls++
    return new Response('raw supplier secret', {status:429})
  }})
  await assert.rejects(service.run(owner,{}),e=>e.status===429&&e.code==='SEED_TRIAL_UPSTREAM_LIMIT'&&!e.message.includes('supplier'))
  assert.equal(calls,1)
})
