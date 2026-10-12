import test from 'node:test'
import assert from 'node:assert/strict'
import {savedRecordGuides,savedRecordUrl} from './savedRecordGuide'
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
