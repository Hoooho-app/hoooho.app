import assert from 'node:assert/strict'
import test from 'node:test'
import {frontDeskUploadReading} from './front-desk-recognition-preview.mjs'
import {continuousPresentation} from './front-desk-presentation.mjs'
const image={id:'image-now',kind:'image',status:'completed',files:[{id:'page-now'}]}
const fact=(text,patch={})=>({text,status:'active',scope:'record',subject:{kind:'unknown'},sources:[{messageId:'image-now',attachmentId:'page-now',quote:text}],...patch})
test('first upload reading uses only the current accepted image sources and never authorizes adoption',()=>{
  const context={version:8,facts:[fact('收费项目：合成检查甲；结果未提供'),fact('尚不能确认日期',{polarity:'unknown'}),fact('被更正内容',{status:'superseded'}),fact('其他图片的内容',{sources:[{messageId:'image-old',attachmentId:'page-old'}]}),fact('未绑定真实附件',{sources:[{messageId:'image-now',attachmentId:'missing'}]})]}
  const result=frontDeskUploadReading(context,[image])
  assert.equal(result.kind,'first_read');assert.equal(result.messageId,image.id);assert.equal(result.version,8)
  assert.equal(result.text,'收费项目：合成检查甲；结果未提供\n尚不能确认日期')
  assert.equal(result.canAdopt,false);assert.equal(result.canConfirmSubject,false);assert.equal(result.draftId,undefined)
  assert.match(result.warnings.join(''),/归属/)
})
test('unread, retracted, pending or unvalidated material never creates a first-reading result',()=>{
  const context={version:2,facts:[fact('合成项目')]}
  assert.equal(frontDeskUploadReading(context,[{...image,status:'pending'}]),null)
  assert.equal(frontDeskUploadReading(context,[{...image,retracted:true}]),null)
  assert.equal(frontDeskUploadReading({...context,understanding:{recordChangesPending:true}},[image]),null)
  assert.equal(frontDeskUploadReading({...context,facts:[]},[image]),null)
})
test('a completed first image reading can offer a draft immediately while ordinary first-question voice still waits',()=>{
  const context={interview:{status:'asking',turnCount:1,question:{id:'observation'}},evidenceVersion:1}
  const messages=[{kind:'image',status:'completed'}],card={recordable:true,hasOriginals:true,saved:null}
  assert.equal(continuousPresentation(context,messages,card).canGenerate,false)
  assert.equal(continuousPresentation(context,messages,{...card,uploadReading:{messageId:'image'}}).canGenerate,true)
  assert.equal(continuousPresentation(context,[{kind:'image',status:'pending'}],{...card,uploadReading:{messageId:'image'}}).canGenerate,false)
})
