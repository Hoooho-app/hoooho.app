import assert from 'node:assert/strict'
import test from 'node:test'
import type {EventAttachmentApiDto,ImageAnalysisStatus} from '../types'
import {getImageRecordSummary,getImageRecordTitle} from './imageAnalysisPresentation'
const attachment=(status:ImageAnalysisStatus):EventAttachmentApiDto=>({id:status,accountId:'synthetic',eventId:'event',recordId:'record',name:'合成图.png',mimeType:'image/png',dataUrl:'data:image/png;base64,AA==',createdAt:'2026-10-28T00:00:00Z',analysis:{status,category:'report',summary:'可读文字 4.2，单位待核对',extractedFacts:[],provider:'synthetic',analyzedAt:'2026-10-28T00:00:00Z'}})
test('pending attachment titles and summaries remain visible with an explicit review qualifier',()=>{
 const pending=attachment('needs_confirmation')
 assert.equal(getImageRecordTitle([pending]),'检查结果（待核对）')
 assert.equal(getImageRecordSummary([pending]),'待核对：可读文字 4.2，单位待核对')
 assert.equal(getImageRecordTitle([pending,attachment('completed')]),'检查结果')
})
test('failed, irrelevant and unsafe material is never promoted to recognized content',()=>{
 for(const status of ['failed','unavailable','irrelevant','unsafe'] as const){
  assert.equal(getImageRecordTitle([attachment(status)]),'图片记录')
  assert.equal(getImageRecordSummary([attachment(status)]),null)
 }
})
