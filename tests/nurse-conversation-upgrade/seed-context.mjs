import {setTimeout as delay} from 'node:timers/promises'

// The app's JsonStore caches reads for 1000ms. A fixture file write occurs in
// the parent process, so it cannot invalidate the isolated app's memory cache.
export const fixtureSnapshotSettleMs=1100
const setupError=code=>Object.assign(new Error('Synthetic context fixture could not be verified'),{code})
function expectedSources(messages,facts){
 const byId=new Map(messages.map(message=>[message.id,message]))
 for(const fact of facts)for(const source of fact.sources??[]){
  const message=byId.get(source.messageId)
  if(!message||message.kind==='assistant'||message.status!=='completed'||source.attachmentId!=null||!source.quote||!message.text.includes(source.quote))throw setupError('EVAL_SEED_SOURCE_INVALID')
 }
}
export async function verifySeedContext({readContext,contextId,messages,facts=[],wait=delay}){
 expectedSources(messages,facts)
 await wait(fixtureSnapshotSettleMs)
 let observed
 for(let attempt=0;attempt<3;attempt++){
  try{observed=await readContext()}catch(error){if(error.status!==404)throw error}
  if(observed?.id===contextId)break
  if(attempt<2)await wait(250)
 }
 if(observed?.id!==contextId)throw setupError('EVAL_SEED_CONTEXT_NOT_VISIBLE')
 const actual=new Map((observed.messages??[]).map(message=>[message.id,message]))
 for(const expected of messages){
  const found=actual.get(expected.id)
  if(!found||found.contextId!==contextId||found.kind!==expected.kind||found.text!==expected.text||found.status!==expected.status)throw setupError('EVAL_SEED_MESSAGES_MISMATCH')
  if(JSON.stringify(found.understanding?.nextQuestion??null)!==JSON.stringify(expected.understanding?.nextQuestion??null))throw setupError('EVAL_SEED_QUESTION_MISMATCH')
 }
 if(actual.size!==messages.length)throw setupError('EVAL_SEED_MESSAGES_MISMATCH')
 const actualFacts=new Map((observed.facts??[]).map(fact=>[fact.id,fact]))
 if(actualFacts.size!==facts.length)throw setupError('EVAL_SEED_FACTS_MISMATCH')
 for(const expected of facts){const found=actualFacts.get(expected.id);if(!found||found.text!==expected.text||found.status!==expected.status||JSON.stringify(found.sources)!==JSON.stringify(expected.sources))throw setupError('EVAL_SEED_FACTS_MISMATCH')}
 return {contextId,messagesVerified:messages.length,factsVerified:facts.length,settleMs:fixtureSnapshotSettleMs}
}
