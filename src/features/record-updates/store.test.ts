import test from 'node:test'
import assert from 'node:assert/strict'
import {trackSavedMutation,useUpdateStore} from './store'
const scope={accountId:'synthetic-account',memberId:'synthetic-member'}
const items=()=>useUpdateStore.getState().items
const clear=()=>useUpdateStore.setState({items:[]})
test('症状、喂养和档案分别进入真实归属；草稿识别和跨人物响应不产生红点',()=>{
 clear()
 trackSavedMutation(scope,'/api/members/synthetic-member/ai-drafts/d/save','POST',{}, {state:'saved',result:{records:[{category:'symptom',recordId:'s',eventId:'s-e'},{category:'diet',recordId:'d',eventId:'d-e'},{category:'allergy',recordId:'a',eventId:'a-e',profileEntries:[{sectionId:'allergy',entryId:'a-p'}]}]}})
 assert.deepEqual(items().map(i=>i.destination),['symptom','calendar','profile'])
 trackSavedMutation(scope,'/api/members/synthetic-member/ai-drafts','POST',{}, {state:'ready'})
 trackSavedMutation(scope,'/api/members/another/ai-drafts/d/save','POST',{}, {state:'saved',result:{records:[{category:'diet',recordId:'other',eventId:'other'}]}})
 assert.equal(items().length,3)
})
test('只读对应项：新版本不被旧页面的已读确认清除，其他项继续保留',()=>{
 clear()
 trackSavedMutation(scope,'/api/quick-records','POST',{journal:{categories:['symptom']}},{eventId:'e',recordId:'s'})
 trackSavedMutation(scope,'/api/quick-records','POST',{journal:{categories:['diet']}},{eventId:'e',recordId:'d'})
 const symptom=items()[0]
 useUpdateStore.getState().read([symptom.id],symptom.at-1)
 assert.equal(items().length,2)
 useUpdateStore.getState().read([symptom.id],symptom.at)
 assert.equal(items().length,1);assert.equal(items()[0].recordId,'d')
})
test('手动编辑、睡眠结束和档案新增归属当前记录，删除不会制造新更新',()=>{
 clear()
 trackSavedMutation(scope,'/api/records/r','PATCH',{}, {id:'r',eventId:'e',journal:{categories:['sleep']},content:'睡眠结束'})
 trackSavedMutation(scope,'/api/members/synthetic-member/profile-list/surgery','POST',{action:'add',name:'虚构资料'}, {rows:[{id:'p',name:'虚构资料'}]})
 trackSavedMutation(scope,'/api/records/r','DELETE',{}, {success:true})
 assert.equal(items().length,1);assert.equal(items()[0].entryId,'p')
})

test('删除合并情况只清除当前孩子和实际删除事件的更新点',()=>{
 clear()
 for(const eventId of ['root','child','keep'])trackSavedMutation(scope,'/api/quick-records','POST',{journal:{categories:['symptom']}},{eventId,recordId:`r-${eventId}`})
 trackSavedMutation(scope,'/api/members/another/cases/root','DELETE',{}, {deletedIds:['root','child']})
 assert.equal(items().length,3)
 trackSavedMutation(scope,'/api/members/synthetic-member/cases/root','DELETE',{}, {deletedIds:['root','child']})
 assert.deepEqual(items().map(item=>item.eventId),['keep'])
})
