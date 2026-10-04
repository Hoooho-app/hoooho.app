import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {foodLabelApi} from './api.mjs'
test('successful and failed API requests are no-store and discard input photo references',async()=>{
  for(const failed of [false,true]){
    const request=new EventEmitter();request.method='POST';const response=new EventEmitter();const headers={};response.setHeader=(k,v)=>{headers[k]=v}
    const input={taskId:'synthetic-food-test',photos:[{dataUrl:'not persisted'}]};let sent
    await foodLabelApi(request,response,{accountId:'synthetic',service:{analyze:async()=>{if(failed)throw Object.assign(new Error('Provider content must not leak'),{code:'AI_NETWORK_ERROR'});return {taskId:input.taskId}}},readJson:async()=>input,sendJson:(_r,status,body)=>{sent={status,body}}})
    assert.match(headers['Cache-Control'],/no-store/);assert.equal(input.photos.length,0);assert.equal(sent.status,failed?503:200);assert.doesNotMatch(JSON.stringify(sent.body),/Provider content/)
  }
})
