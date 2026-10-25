import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {createServer} from 'node:http'
import path from 'node:path'
import os from 'node:os'
import {JsonStore} from '../../server/auth/storage/json-store.mjs'
import {verifySeedContext,fixtureSnapshotSettleMs} from './seed-context.mjs'

const messages=[{id:'user-original',contextId:'context-exact',kind:'text',text:'昨晚咳嗽',status:'completed'},{id:'assistant-question',contextId:'context-exact',kind:'assistant',text:'是什么时候开始的？',status:'completed',understanding:{nextQuestion:{id:'onset',text:'是什么时候开始的？',target:'onset',sourceMessageId:'user-original'}}}]
const facts=[{id:'fact-original',text:'昨晚咳嗽',status:'active',sources:[{messageId:'user-original',attachmentId:null,quote:'昨晚咳嗽'}]}]
const context=()=>({id:'context-exact',messages:structuredClone(messages),facts:structuredClone(facts)})
test('real JsonStore HTTP fixture expires its stale snapshot before exact-context GET and source verification',async t=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'hoooho-eval-seed-'))
 assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));assert(path.basename(temp).startsWith('hoooho-eval-seed-'))
 t.after(()=>rm(temp,{recursive:true,force:true}))
 const file=path.join(temp,'front-desk-records.json'),store=new JsonStore(file,{contexts:[]})
 const server=createServer(async(_request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify((await store.read()).contexts.find(item=>item.id==='context-exact')??null))})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
 const readContext=async()=>await (await fetch(`http://127.0.0.1:${server.address().port}/contexts/context-exact`)).json()
 assert.equal(await readContext(),null)
 await writeFile(file,JSON.stringify({contexts:[context()]}))
 assert.equal(await readContext(),null,'the child-style in-memory snapshot is genuinely still stale')
 const started=Date.now(),verified=await verifySeedContext({readContext,contextId:'context-exact',messages,facts})
 assert(Date.now()-started>=1000);assert.equal(verified.settleMs,fixtureSnapshotSettleMs);assert.equal(verified.messagesVerified,2);assert.equal(verified.factsVerified,1)
})
test('foreign contexts, modified questions and mixed fact sources fail fixture setup without any model',async()=>{
 const opts={contextId:'context-exact',messages,facts,wait:async()=>{}}
 await assert.rejects(()=>verifySeedContext({...opts,readContext:async()=>({...context(),id:'previous-member-context'})}),{code:'EVAL_SEED_CONTEXT_NOT_VISIBLE'})
 const wrongQuestion=context();wrongQuestion.messages[1].understanding.nextQuestion.sourceMessageId='unrelated-message'
 await assert.rejects(()=>verifySeedContext({...opts,readContext:async()=>wrongQuestion}),{code:'EVAL_SEED_QUESTION_MISMATCH'})
 const wrongFacts=context();wrongFacts.facts[0].sources[0].messageId='another-source'
 await assert.rejects(()=>verifySeedContext({...opts,readContext:async()=>wrongFacts}),{code:'EVAL_SEED_FACTS_MISMATCH'})
 let read=false
 await assert.rejects(()=>verifySeedContext({...opts,facts:[{...facts[0],sources:[{messageId:'assistant-question',quote:'是什么时候开始的？'}]}],readContext:async()=>{read=true;return context()}}),{code:'EVAL_SEED_SOURCE_INVALID'})
 assert.equal(read,false,'assistant wording cannot become setup fact evidence')
})
test('fixture wait precedes first read, uses bounded retries, and accepts only exact seeded messages',async()=>{
 const order=[];let reads=0
 const verified=await verifySeedContext({contextId:'context-exact',messages,facts,wait:async ms=>order.push(['wait',ms]),readContext:async()=>{order.push(['read']);return ++reads===1?null:context()}})
 assert.deepEqual(order[0],['wait',1100]);assert.equal(reads,2);assert.equal(verified.factsVerified,1)
 const mutated=context();mutated.messages[0].text='今天咳嗽'
 await assert.rejects(()=>verifySeedContext({contextId:'context-exact',messages,facts,wait:async()=>{},readContext:async()=>mutated}),{code:'EVAL_SEED_MESSAGES_MISMATCH'})
})
