import test from 'node:test'
import assert from 'node:assert/strict'
import {dismissSavedRecordGuide,savedRecordGuides,savedRecordUrl} from './savedRecordGuide'
import type {SmartRecordDraft} from './smartRecordTypes'
const draft=(id:string,recordId:string):SmartRecordDraft=>({id,version:2,state:'saved',inputText:'原话',items:[],result:{count:1,records:[{eventId:'event',recordId,memberId:'member',category:'sleep'}]}})
test('success guides require persisted results and keep exact identities across subsequent saves',()=>{
  assert.deepEqual(savedRecordGuides({...draft('a','1'),state:'ready'},'member'),[])
  assert.deepEqual(savedRecordGuides(draft('a','1'),'other'),[])
  const first=savedRecordGuides(draft('a','1'),'member')[0],second=savedRecordGuides(draft('b','2'),'member')[0]
  assert.equal(first.text,'睡眠已记好，可在健康随记查看。')
  assert.notEqual(first.id,second.id)
  assert.equal(new URL(savedRecordUrl(first),'https://example.test').searchParams.get('recordId'),'1')
  assert.equal(new URL(savedRecordUrl(second),'https://example.test').searchParams.get('recordId'),'2')
})
test('profile guides point to exact persisted category and entry, unknown types stay neutral',()=>{
  const saved=draft('v','3');saved.result!.records[0]={...saved.result!.records[0],category:'vaccination',profileEntries:[{sectionId:'vaccination',entryId:'3/vaccine'}]}
  const guide=savedRecordGuides(saved,'member')[0]
  assert.equal(guide.text,'接种记录已保存，可在健康档案查看。')
  assert.equal(new URL(savedRecordUrl(guide),'https://example.test').searchParams.get('entryId'),'3/vaccine')
  saved.result!.records[0].category='other';saved.result!.records[0].profileEntries=[]
  assert.equal(savedRecordGuides(saved,'member')[0].text,'记录已记好，可在健康随记查看。')
})

test('receipt title comes from its exact saved reference, never positional candidate pairing',()=>{
 const saved=draft('exact','r');saved.items=[{id:'unrelated',category:'symptom',title:'另一条未保存标题',timeText:null,time:{resolvedStart:null,precision:'unknown'},fields:[]}]
 saved.result!.records[0]={...saved.result!.records[0],title:'用户核对过的睡眠记录',itemId:'saved-item'}
 const guide=savedRecordGuides(saved,'member','小禾')[0]
 assert.equal(guide.title,'用户核对过的睡眠记录');assert.equal(guide.memberName,'小禾')
 assert.equal(guide.recordId,'r');assert.equal(guide.itemId,'saved-item')
 const old=savedRecordGuides(draft('old','old-r'),'member')[0]
 assert.equal(old.title,undefined);assert.equal(old.memberName,undefined)
})
test('dismissing one guide preserves its saved destination and other guides without mutation',()=>{
 const first=savedRecordGuides(draft('first','record-1'),'member')[0],second=savedRecordGuides(draft('second','record-2'),'member')[0]
 const dismissed=dismissSavedRecordGuide([first,second],first.id)
 assert.equal(first.dismissed,undefined);assert.equal(dismissed[0].dismissed,true)
 assert.equal(savedRecordUrl(dismissed[0]),savedRecordUrl(first));assert.equal(dismissed[0].recordId,'record-1')
 assert.equal(dismissed[1],second)
})
