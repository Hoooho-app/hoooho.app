import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { HelpService, localHelpReply } from './help-service.mjs'
import { helpApi } from './help-api.mjs'
import { AccountDataService } from '../account/account-data-service.mjs'
import { SUPPORT_ARTICLES, EXTRA_ARTICLES, USER_MANUAL, HELP_MODULES } from '../../shared/help-center.mjs'

async function fixture(t,provider=null){
  const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-help-test-'))
  t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
  return {dataDirectory,service:new HelpService({dataDirectory,provider})}
}
const question=(session,text='录音没有成功',requestId='q1')=>({version:session.version,text,requestId})
const response=output=>({ok:true,json:async()=>({output:[{content:[{text:JSON.stringify(output)}]}]})})

test('current knowledge links, modules and manuals resolve to published articles',()=>{
  const articles=[...SUPPORT_ARTICLES,...EXTRA_ARTICLES],ids=new Set(articles.map(a=>a.id))
  assert.equal(ids.size,articles.length)
  for(const a of articles)for(const id of a.relatedArticleIds??[])assert.ok(ids.has(id),`${a.id}: ${id}`)
  for(const m of USER_MANUAL){assert.ok(ids.has(m.helpArticleId));assert.ok(m.purpose&&m.scene&&m.output);assert.ok(HELP_MODULES.some(x=>x.id===m.module))}
  for(const m of HELP_MODULES)for(const id of m.articleIds)assert.ok(ids.has(id))
  assert.ok(articles.every(a=>a.actions?.every(x=>x.to.startsWith('/')&&!x.to.startsWith('//'))??true))
})
test('ownership, stale writes and retries preserve a single durable conversation',async t=>{
  const {service,dataDirectory}=await fixture(t),session=await service.start('a')
  await assert.rejects(service.owned('b',session.id),{status:404})
  const input=question(session),updated=await service.turn('a',session.id,input)
  assert.equal(updated.turns.length,3);assert.equal(updated.turns.at(-1).askResolved,false)
  assert.deepEqual(await service.turn('a',session.id,input),updated)
  await assert.rejects(service.turn('a',session.id,{...input,text:'另一个问题'}),{status:400})
  await assert.rejects(service.turn('a',session.id,question(session,'图片上传失败','q2')),{status:409})
  assert.equal((await new HelpService({dataDirectory,provider:null}).start('a')).id,session.id)
  assert.notEqual((await service.start('b')).id,session.id)
  assert.notEqual((await service.start('a',{new:true})).id,session.id)
})
test('unresolved feedback persists, is idempotent and continues clarification',async t=>{
  const {service,dataDirectory}=await fixture(t),session=await service.start('a')
  const answered=await service.turn('a',session.id,question(session,'录音后转写失败'))
  const input={version:answered.version,turnId:answered.turns.at(-1).id,solved:false}
  const rated=await service.rate('a',session.id,input)
  assert.equal(rated.ratings.length,1);assert.equal(rated.ratings[0].solved,false)
  assert.match(rated.turns.at(-1).text,/继续排查/)
  assert.deepEqual(await service.rate('a',session.id,input),rated)
  await assert.rejects(service.rate('a',session.id,{...input,solved:true}),{status:409})
  assert.deepEqual(await new HelpService({dataDirectory,provider:null}).start('a'),rated)
  await assert.rejects(service.rate('a',session.id,{version:rated.version,turnId:rated.turns.at(-1).id,solved:true}),{status:400})
})
test('real provider contract includes approved knowledge and conversation without account data',async t=>{
  let calls=0,body
  const provider={baseUrl:'https://example.test',apiKey:'local-test-key',fetch:async(url,init)=>{calls++;body=JSON.parse(init.body);assert.equal(url,'https://example.test/responses');assert.equal(init.headers.Authorization,'Bearer local-test-key');assert.equal(body.text.format.strict,true);return response({reply:'先保留内容，再重试。',articleIds:['save'],choices:[],askResolved:true})}}
  const {service}=await fixture(t,provider),session=await service.start('private-account')
  const input=question(session,'保存失败'),answer=await service.turn('private-account',session.id,input)
  assert.equal(answer.turns.at(-1).mode,'ai');assert.equal(calls,1)
  assert.match(body.instructions,/用户手册/);assert.match(body.input,/保存失败/);assert.doesNotMatch(JSON.stringify(body),/private-account/)
  await service.turn('private-account',session.id,input);assert.equal(calls,1)
})
test('invalid provider links and failures use explicit local fallback with no automatic retry',async t=>{
  let calls=0
  const {service}=await fixture(t,{baseUrl:'https://example.test',fetch:async()=>{calls++;return response({reply:'https://bad.test',articleIds:['save'],choices:[],askResolved:true})}})
  const session=await service.start('a'),answer=await service.turn('a',session.id,question(session,'保存失败'))
  assert.equal(calls,1);assert.equal(answer.turns.at(-1).mode,'local');assert.match(answer.notice,/暂时不可用/);assert.doesNotMatch(answer.turns.at(-1).text,/https/)
})
test('linked model instructions retain evaluation when the model omits the flag, without evaluating clarification',async t=>{
  let output={reply:'点击保存 HTML 文件，再到浏览器下载记录打开。',articleIds:['html'],choices:[],askResolved:false}
  const {service}=await fixture(t,{baseUrl:'https://example.test',fetch:async()=>response(output)})
  const session=await service.start('a'),answered=await service.turn('a',session.id,question(session,'保存情况单'))
  assert.equal(answered.turns.at(-1).askResolved,true)
  const rated=await service.rate('a',session.id,{version:answered.version,turnId:answered.turns.at(-1).id,solved:false})
  assert.equal(rated.ratings[0].solved,false)
  output={...output,reply:'请告诉我你用的是哪种手机浏览器。'}
  const clarification=await service.turn('a',session.id,question(rated,'还是没找到','q2'))
  assert.equal(clarification.turns.at(-1).askResolved,false)
  output={...output,reply:'你使用哪种手机？',choices:['iPhone','安卓']}
  const questionAnswer=await service.turn('a',session.id,question(clarification,'怎么找','q3'))
  assert.equal(questionAnswer.turns.at(-1).askResolved,false)
})
test('secrets rejected before persistence or provider; medical request cannot invoke provider',async t=>{
  let calls=0
  const {service}=await fixture(t,{baseUrl:'https://example.test',fetch:async()=>{calls++;throw new Error('unexpected')}})
  const session=await service.start('a')
  await assert.rejects(service.turn('a',session.id,question(session,'验证码：123456')),{code:'HELP_SENSITIVE_INPUT'})
  assert.equal((await service.start('a')).turns.length,1);assert.equal(calls,0)
  const answer=await service.turn('a',session.id,question(session,'孩子发烧吃什么药'))
  assert.equal(calls,0);assert.match(answer.turns.at(-1).text,/不能提供诊断/)
})
test('concurrent sends do not duplicate model requests or overwrite the answer',async t=>{
  let finish,calls=0
  const pending=new Promise(resolve=>finish=resolve)
  const {service}=await fixture(t,{baseUrl:'https://example.test',fetch:async()=>{calls++;await pending;return response({reply:'请查看保存步骤。',articleIds:['save'],choices:[],askResolved:true})}})
  const session=await service.start('a'),input=question(session,'保存失败'),first=service.turn('a',session.id,input)
  while(!calls)await new Promise(resolve=>setImmediate(resolve))
  await assert.rejects(service.turn('a',session.id,input),{code:'HELP_BUSY'});finish()
  assert.equal((await first).turns.length,3);assert.equal(calls,1)
})
test('guest merge and account deletion include help conversations with isolated ownership',async t=>{
  const {service,dataDirectory}=await fixture(t),guest=await service.start('guest:a'),other=await service.start('b')
  const data=new AccountDataService({dataDirectory})
  await data.mergeGuest('guest:a','a')
  assert.equal((await service.owned('a',guest.id)).id,guest.id)
  await assert.rejects(service.owned('guest:a',guest.id),{status:404})
  await data.deleteAccount('a')
  await assert.rejects(service.owned('a',guest.id),{status:404})
  assert.equal((await service.owned('b',other.id)).id,other.id)
})
test('API rejects unsupported routes and exposes only owned session views',async t=>{
  const {service}=await fixture(t)
  assert.equal(await helpApi(service,'a','/api/other','GET',async()=>({})),null)
  const created=await helpApi(service,'a','/api/help/sessions','POST',async()=>({}))
  assert.equal(created.status,200);assert.equal(created.body.accountId,undefined)
  await assert.rejects(helpApi(service,'b',`/api/help/sessions/${created.body.id}`,'GET',async()=>({})),{status:404})
  await assert.rejects(helpApi(service,'a','/api/help/unknown','POST',async()=>({})),{status:404})
})

test('录音正常且重复转写失败时保留输入并进入具体错误排查，不再循环要求麦克风权限',()=>{
 const result=localHelpReply([{role:'user',text:'麦克风权限已开启，可以录音，但转写提示失败。重试两次还不成功，下一步怎么操作？'}])
 assert.match(result.reply,/完整提示/);assert.match(result.reply,/反馈意见/);assert.match(result.reply,/文字/);assert.doesNotMatch(result.reply,/先检查当前网站/);assert.equal(result.askResolved,false)
})
