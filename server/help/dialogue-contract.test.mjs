import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { HelpService } from './help-service.mjs'
import { FeedbackInterview } from './feedback-interview.mjs'
import { createDialogueProvider } from '../ai/providers/dialogue-provider.mjs'

const jpeg = Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(100)])
const image = `data:image/jpeg;base64,${jpeg.toString('base64')}`
test('all conversation roles select Qwen despite a legacy global OpenAI selection', async () => {
  let target, body
  const provider=createDialogueProvider({env:{AI_PROVIDER:'openai',OPENAI_API_KEY:'legacy-fixture',BAILIAN_API_KEY:'bailian-fixture',BAILIAN_BASE_URL:'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'},fetchImpl:async(url,init)=>{
    target=url;body=JSON.parse(init.body)
    return Response.json({choices:[{finish_reason:'stop',message:{content:'{"reply":"可以继续补充。"}'}}]})
  },logger:{info(){},warn(){}}})
  assert.equal(provider.name,'bailian')
  await provider.fetch(`${provider.baseUrl}/responses`,{body:JSON.stringify({instructions:'fixture policy',input:'fixture question',text:{format:{type:'json_schema',name:'dialogue_test',schema:{type:'object',required:['reply'],additionalProperties:false,properties:{reply:{type:'string'}}}}}})})
  assert.equal(target,'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions')
  assert.equal(body.model,'qwen3.7-plus');assert.equal(body.stream,false)
})
test('help screenshots reach only the supplied Qwen request; retry checks image identity and storage excludes image bytes',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'dialogue-contract-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  let calls=0,body
  const service=new HelpService({dataDirectory:directory,provider:{baseUrl:'https://fixture.invalid',fetch:async(_,init)=>{
    calls++;body=JSON.parse(init.body)
    return Response.json({output:[{content:[{text:JSON.stringify({reply:'请先保留草稿，再重试。',articleIds:['save'],choices:[],askResolved:true})}]}]})
  }}})
  const session=await service.start('account'),input={version:0,text:'保存失败',requestId:'request',image}
  const result=await service.turn('account',session.id,input)
  assert.equal(body.input[0].content[1].image_url,image);assert.equal(result.turns[1].imageAttached,true)
  assert.equal(JSON.stringify(await service.owned('account',session.id)).includes(image),false)
  await service.turn('account',session.id,input);assert.equal(calls,1)
  await assert.rejects(service.turn('account',session.id,{...input,image:undefined}),/同一请求/)
  await assert.rejects(service.owned('other-account',session.id),{status:404})
})
test('invalid screenshots are rejected before either product role calls a model',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'dialogue-image-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  let calls=0;const provider={fetch:async()=>{calls++;throw new Error('must not call')}}
  const help=new HelpService({dataDirectory:directory,provider}),session=await help.start('account')
  const feedback=new FeedbackInterview({provider})
  for(const bad of ['https://example.test/picture.jpg','data:image/jpeg;base64,AAAA',image+'$',image.repeat(28000)]){
    await assert.rejects(help.turn('account',session.id,{version:0,requestId:'test',text:'使用问题',image:bad}),{code:'DIALOGUE_IMAGE_INVALID'})
    await assert.rejects(feedback.respond('account',{turns:[{role:'user',text:'使用问题'}],mode:'chat',image:bad}),{code:'DIALOGUE_IMAGE_INVALID'})
  }
  assert.equal(calls,0)
})
