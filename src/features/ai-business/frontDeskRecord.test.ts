import test from 'node:test'
import assert from 'node:assert/strict'
import {restoreFrontContext} from './frontDeskRecord.ts'
import {fileIdentity,type CaptureDraft} from './captureDraft.ts'

const local=():CaptureDraft=>({text:'另一件旧事情',files:[],conversationInput:'还没发送的中文',occurredAt:'2026-01-01T10:00',timeUnknown:false,requestId:'local'})
test('模型选择的记录上下文只汇总该事件用户来源，护士回复不进入整理',()=>{
 const restored=restoreFrontContext({id:'food',updatedAt:'2026-10-12T00:00:00Z',messages:[{id:'input-1',kind:'text',text:'吃了半碗粥',contextId:'food',status:'completed'},{id:'reply-1',kind:'assistant',text:'收到。',contextId:'food',status:'completed'}]},local())
 assert.equal(restored.text,'吃了半碗粥');assert.equal(restored.conversationInput,'还没发送的中文');assert.equal(restored.requestId,'food');assert.equal(restored.conversationTurns?.length,2)
 assert.equal(restored.capturedAt,'2026-10-12T00:00:00.000Z')
})
test('后端回调不能吞掉后续待提交消息、录音原件和未发送文字',()=>{
 const file=new File(['original'],'voice.webm',{type:'audio/webm',lastModified:42}),draft={...local(),files:[file],pendingVoice:file,conversationTurns:[{id:'pending-voice',text:'',kind:'voice' as const,status:'transcribing' as const,fileKeys:[fileIdentity(file)]}]}
 const restored=restoreFrontContext({id:'food',updatedAt:'2026-10-12T00:00:00Z',messages:[]},draft)
 assert.equal(restored.pendingVoice,file);assert.equal(restored.files[0],file);assert.equal(restored.conversationTurns?.[0].id,'pending-voice');assert.equal(restored.conversationInput,draft.conversationInput)
})
test('已正式保存的记录找回不变成下一次整理材料；媒体字节和身份可恢复',async()=>{
 const context={id:'saved',saved:true,updatedAt:'2026-10-12T00:00:00Z',messages:[{id:'photo',kind:'image' as const,text:'',contextId:'saved',status:'completed' as const,files:[{name:'测试.png',mimeType:'image/png',dataUrl:'data:image/png;base64,Ynl0ZXM=',lastModified:42}]}]}
 const saved=restoreFrontContext(context,local());assert.equal(saved.text,'');assert.deepEqual(saved.files,[])
 const restored=restoreFrontContext({...context,saved:false},local());assert.equal(await restored.files[0].text(),'bytes');assert.equal(restored.files[0].lastModified,42);assert.equal(restored.conversationTurns?.[0].fileKeys?.[0],fileIdentity(restored.files[0]))
})
test('focused question identity and short-answer binding survive restore but disappear after save',()=>{
 const interview={version:'test',status:'asking' as const,domain:'respiratory',turnCount:1,askedQuestionIds:['resp-effort'],stopReason:null,question:{id:'resp-effort',text:'呼吸是否费力？',options:[{label:'没注意',value:'暂时没注意'}],sourceIds:['rch-assessment']}}
 const context={id:'cough',updatedAt:'2026-10-24T08:00:00Z',interview,messages:[{id:'answer',kind:'voice' as const,text:'没有',contextId:'cough',status:'completed' as const,answerTo:{contextId:'cough',questionId:'resp-effort'}}]}
 const restored=restoreFrontContext(context,local())
 assert.equal(restored.nursingInterview?.question?.id,'resp-effort')
 assert.deepEqual(restored.conversationTurns?.[0].answerTo,{contextId:'cough',questionId:'resp-effort'})
 assert.equal(restored.conversationInput,'还没发送的中文')
 assert.equal(restoreFrontContext({...context,saved:true},restored).nursingInterview,undefined)
})

test('续聊只展示已保存历史，新草稿的文字与媒体仅来自当前记录意图',()=>{
 const previous={id:'old',kind:'text' as const,text:'昨天发红，已保存',contextId:'saved',status:'completed' as const}
 const current={id:'new',kind:'text' as const,text:'今天颜色淡了',contextId:'continued',status:'completed' as const}
 const restored=restoreFrontContext({id:'continued',updatedAt:'2026-10-25T01:00:00Z',previousMessages:[previous],messages:[current]},{...local(),resumeContextId:'saved'})
 assert.equal(restored.text,'今天颜色淡了')
 assert.equal(restored.resumeContextId,'continued')
 assert.deepEqual(restored.conversationTurns?.map(t=>t.text),['昨天发红，已保存','今天颜色淡了'])
 assert.deepEqual(restored.files,[])
})
