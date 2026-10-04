import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {foodLabelApi,createFoodLabelService} from './api.mjs'
import {mkdtemp,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {JsonStore} from '../auth/storage/json-store.mjs'
test('successful and failed API requests are no-store and discard input photo references',async()=>{
  for(const failed of [false,true]){
    const request=new EventEmitter();request.method='POST';const response=new EventEmitter();const headers={};response.setHeader=(k,v)=>{headers[k]=v}
    const input={taskId:'synthetic-food-test',photos:[{dataUrl:'not persisted'}]};let sent
    await foodLabelApi(request,response,{accountId:'synthetic',service:{analyze:async()=>{if(failed)throw Object.assign(new Error('Provider content must not leak'),{code:'AI_NETWORK_ERROR'});return {taskId:input.taskId}}},readJson:async()=>input,sendJson:(_r,status,body)=>{sent={status,body}}})
    assert.match(headers['Cache-Control'],/no-store/);assert.equal(input.photos.length,0);assert.equal(sent.status,failed?503:200);assert.doesNotMatch(JSON.stringify(sent.body),/Provider content/)
  }
})
test('archive is read-only, scoped by owner/member, and legacy status does not invent confirmation',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'synthetic-food-archive-')),filename=path.join(directory,'health-profile-sections.json')
  const store=new JsonStore(filename,{sections:[]})
  await store.update(()=>({sections:[{accountId:'owner',memberId:'child',sectionId:'allergy',records:[{accountId:'legacy-token-placeholder',memberId:'child',category:'食物',name:'牛乳',certainty:'已明确'},{memberId:'foreign',category:'food',name:'鸡蛋',currentStatus:'confirmed'},{memberId:'child',category:'food',name:'大豆',certainty:'尚未明确'}]},{accountId:'other',memberId:'child',sectionId:'allergy',records:[{category:'food',name:'花生',currentStatus:'confirmed'}]}]}))
  const before=await readFile(filename,'utf8'),service=createFoodLabelService({dataDirectory:directory,model:{}})
  const records=await service.readRecords('owner','child');assert.equal(records.length,2);assert.equal(records[0].currentStatus,'confirmed');assert.notEqual(records[1].currentStatus,'confirmed');assert.deepEqual(await service.readRecords('owner','foreign'),[])
  assert.equal(await readFile(filename,'utf8'),before)
})
