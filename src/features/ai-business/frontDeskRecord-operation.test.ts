import test from 'node:test'
import assert from 'node:assert/strict'
import {recordOperationTurn,restoreFrontContext,type FrontContext} from './frontDeskRecord.ts'
import type {CompletedRecordOperation} from './recognitionJobs.ts'
import type {CaptureDraft} from './captureDraft.ts'

const receipt=(type:'query'|'export'='export'):CompletedRecordOperation=>({operationId:'operation-one',type,targetId:'draft-one',targetVersion:3,state:'completed',snapshot:{inputText:'昨晚碰到右脚小趾，是否肿胀未观察清楚。',items:[]},...(type==='export'?{fileName:'护护记录.txt',text:'原话\n来源 message-one:「昨晚碰到右脚小趾」'}:{})})
test('only a complete returned export receipt creates a downloadable exact snapshot',()=>{
 assert.equal(recordOperationTurn(undefined),undefined)
 assert.equal(recordOperationTurn({...receipt(),text:''}),undefined)
 assert.equal(recordOperationTurn({...receipt(),targetVersion:0}),undefined)
 const result=recordOperationTurn(receipt(),42)
 assert.equal(result?.id,'operation:operation-one');assert.equal(result?.at,42)
 assert.equal(result?.operationResult?.targetId,'draft-one');assert.equal(result?.operationResult?.targetVersion,3)
 assert.equal(result?.operationResult?.text,receipt().text)
 assert.equal(result?.text.includes('保存'),false)
})
test('query shows the returned original including unknowns without claiming a fresh model result',()=>{
 const result=recordOperationTurn(receipt('query'))
 assert.equal(result?.text,receipt().snapshot.inputText)
 assert.equal(result?.operationResult?.type,'query')
})
test('later conversation restoration preserves the old operation snapshot and new composer input',()=>{
 const operation=recordOperationTurn(receipt())!
 const local:CaptureDraft={text:'新草稿',files:[],requestId:'current',occurredAt:'',timeUnknown:true,conversationInput:'没有发送的新内容',conversationTurns:[operation]}
 const context:FrontContext={id:'current',updatedAt:'2026-10-26T02:00:00Z',resultKind:'conversation',messages:[]}
 const restored=restoreFrontContext(context,local)
 assert.equal(restored.conversationTurns?.find(turn=>turn.id===operation.id)?.operationResult,operation.operationResult)
 assert.equal(restored.conversationInput,local.conversationInput)
 assert.equal(restored.text,local.text)
})
