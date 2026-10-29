import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const source=readFileSync(new URL('../../ios/Hoooho/App/NativeBridge.js',import.meta.url),'utf8')
function bridge(respond,{origin='https://hoooho.com',main=true}={}){
  const messages=[],window={origin},navigator={}
  window.top=main?window:{}
  window.webkit={messageHandlers:{hooohoNative:{postMessage(message){messages.push(message);queueMicrotask(()=>window.__hooohoNativeReply(message.id,respond(message)))}}}}
  vm.runInNewContext(source,{window,navigator,File,Uint8Array,crypto,DOMException,atob,setTimeout,clearTimeout,document:{documentElement:{outerHTML:'synthetic'}}})
  return {window,messages}
}

test('native selection rebuilds original bytes from bounded chunks and releases them once',async()=>{
  const bytes=Buffer.alloc(512*1024+19,37)
  const {window,messages}=bridge(message=>{
    if(message.type==='attachments')return {ok:true,selectionId:'selection',origin:'library',files:[{id:'file',name:'原始资料.pdf',size:bytes.length,mimeType:'application/pdf'}]}
    if(message.type==='attachment_read')return {ok:true,data:bytes.subarray(message.offset,message.offset+512*1024).toString('base64')}
    return {ok:true}
  })
  const result=await window.hooohoNativeAttachments()
  assert.equal(result.origin,'library');assert.equal(result.files.length,1)
  assert.equal(result.files[0].name,'原始资料.pdf');assert.equal(result.files[0].type,'application/pdf')
  assert.deepEqual(Buffer.from(await result.files[0].arrayBuffer()),bytes)
  assert.deepEqual(messages.map(m=>m.type),['attachments','attachment_read','attachment_read','attachment_release'])
  assert.deepEqual(messages.filter(m=>m.type==='attachment_read').map(m=>m.offset),[0,512*1024])
})

test('cancelling the native menu rejects without starting reads or fabricating a file',async()=>{
  const {window,messages}=bridge(()=>({ok:false,cancelled:true,error:'已取消'}))
  await assert.rejects(window.hooohoNativeAttachments(),{name:'AbortError'})
  assert.deepEqual(messages.map(m=>m.type),['attachments'])
})

test('a failed byte read still releases selected files and stays a visible operation error',async()=>{
  const {window,messages}=bridge(message=>message.type==='attachments'?{ok:true,selectionId:'selected',origin:'capture',files:[{id:'photo',name:'photo.jpg',mimeType:'image/jpeg',size:3}]}:message.type==='attachment_read'?{ok:false,error:'文件已过期'}:{ok:true})
  await assert.rejects(window.hooohoNativeAttachments(),{name:'OperationError',message:'文件已过期'})
  assert.deepEqual(messages.map(m=>m.type),['attachments','attachment_read','attachment_release'])
})

test('the attachment capability is absent for untrusted pages and report subframes',()=>{
  assert.equal(bridge(()=>({ok:true}),{origin:'https://hoooho.com.attacker.invalid'}).window.hooohoNativeAttachments,undefined)
  assert.equal(bridge(()=>({ok:true}),{main:false}).window.hooohoNativeAttachments,undefined)
})

test('appearance is main-frame only and sends opaque RGB without opening a system operation',()=>{
  const {window,messages}=bridge(()=>({ok:true}))
  window.hooohoNativeAppearance('#f0f4f5')
  for(const invalid of ['red','#fff','#ffffff00','#ffffff\n'])window.hooohoNativeAppearance(invalid)
  assert.deepEqual(messages.map(({type,color})=>({type,color})),[{type:'appearance',color:'#f0f4f5'}])
  assert.equal(bridge(()=>({ok:true}),{main:false}).window.hooohoNativeAppearance,undefined)
  assert.equal(bridge(()=>({ok:true}),{origin:'https://example.invalid'}).window.hooohoNativeAppearance,undefined)
})

test('media-only selection is advertised and scoped to the explicit request',async()=>{
  const {window,messages}=bridge(()=>({ok:false,cancelled:true}))
  assert.equal(window.hooohoNativeAttachments.supportsMediaOnly,true)
  await assert.rejects(window.hooohoNativeAttachments({mediaOnly:true}),{name:'AbortError'})
  await assert.rejects(window.hooohoNativeAttachments(),{name:'AbortError'})
  assert.equal(messages[0].mediaOnly,true)
  assert.equal(messages[1].mediaOnly,undefined)
})
