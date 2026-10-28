import assert from 'node:assert/strict'
import test from 'node:test'
import {recognitionAcceptedInput,recoverUnreceivedTurns,applyRecognitionReceipt} from './recognitionSubmission'
import type {RecognitionJob} from './recognitionJobs'
import type {CaptureTurn} from './captureDraft'
const receipt=(patch:Partial<RecognitionJob>={}):RecognitionJob=>({id:'old-job',state:'ready',stage:'ready',seq:9,inputRevision:1,resultRevision:1,createdAt:'2026-10-29T00:00:00Z',updatedAt:'2026-10-29T00:00:01Z',inputStates:[{id:'older-text',status:'completed',text:'先前的观察'}],...patch})
test('a lost acknowledgement can recover only the exact accepted input, never an older task or cancellation',()=>{
  assert.equal(recognitionAcceptedInput(receipt(),'new-photo'),false)
  assert.equal(recognitionAcceptedInput(receipt({inputStates:[{id:'new-photo',status:'pending',text:''}]}),'new-photo'),true)
  assert.equal(recognitionAcceptedInput(receipt({state:'discarded',inputStates:[{id:'new-photo',status:'completed',text:''}]}),'new-photo'),false)
  assert.equal(recognitionAcceptedInput(receipt({inputStates:undefined}),'new-photo'),false)
})
test('a restored unreceived image becomes retryable without replaying or replacing its original',()=>{
  const turns:CaptureTurn[]=[{id:'new-photo',text:'',kind:'image',role:'user',fileKeys:['immutable-image'],status:'pending'},{id:'older-text',text:'先前的观察',role:'user',status:'pending'},{id:'nurse',text:'之前的问题',role:'assistant',status:'pending'}]
  const next=recoverUnreceivedTurns(turns,receipt())!
  assert.equal(next[0].status,'failed');assert.equal(next[0].errorCode,'RECOGNITION_NOT_ACCEPTED')
  assert.deepEqual(next[0].fileKeys,['immutable-image']);assert.equal(next[0].id,'new-photo')
  assert.equal(next[1],turns[1]);assert.equal(next[2],turns[2]);assert.equal(turns[0].status,'pending')
  assert.equal(recoverUnreceivedTurns(turns,receipt({state:'running'})),turns)
  assert.equal(recoverUnreceivedTurns(turns,receipt({inputStates:undefined})),turns)
  assert.equal(recoverUnreceivedTurns(turns,receipt(),new Set(['unrelated-restored-input'])),turns,'a fresh local upload must never be failed by an older receipt')
})
test('a cancellation receipt never turns a cancelled image back into pending or alters an older completed input',()=>{
  const turns:CaptureTurn[]=[{id:'new-photo',text:'',kind:'image',status:'failed',errorCode:'RECOGNITION_INPUT_CANCELLED',fileKeys:['original']},{id:'older-text',text:'先前的观察',status:'completed'}]
  const next=applyRecognitionReceipt(turns,receipt({state:'discarded',inputStates:[{id:'new-photo',text:'',status:'pending'},{id:'older-text',text:'先前的观察',status:'completed'}]}))!
  assert.equal(next[0].status,'failed');assert.equal(next[0].errorCode,'RECOGNITION_INPUT_CANCELLED');assert.deepEqual(next[0].fileKeys,['original'])
  assert.equal(next[1].status,'completed')
})
