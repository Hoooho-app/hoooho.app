import test from 'node:test'
import assert from 'node:assert/strict'
import {readablePreview,quarantinePreview} from './readable-preview.mjs'
test('只投影可读字段，不展示内部JSON、工具或未知键；不补造事实',()=>{
  const p=readablePreview(JSON.stringify({items:[{title:'合成观察',timeText:'今天',fields:[{name:'symptom',value:'恶心',quote:'今天只是恶心'},{name:'symptom',value:'没有呕吐',quote:'没有呕吐'}]}],tools:['DROP DATABASE'],Authorization:'ignored',thought:'ignored'}),{provider:'bailian',model:'qwen3.7-plus',requestId:'synthetic'})
  assert.match(p.text,/恶心/);assert.match(p.text,/没有呕吐/);assert.doesNotMatch(p.text,/Authorization|ignored|DATABASE|"items"/)
  const q=quarantinePreview(p,{stage:'source_validation',fieldPath:'/items/1/fields/0'})
  assert.equal(q.status,'unverified');assert.equal(q.issues[0].fieldPath,'/items/1/fields/0');assert.match(q.warning,/不会自动保存/)
})
test('不可读或含凭据的内容不投影，不虚构空结果；HTML只作文本',()=>{
  for(const value of ['', '{"items":','```json\n{}','Bearer synthetic','sk-synthetic'])assert.equal(readablePreview(value),null)
  assert.equal(readablePreview(JSON.stringify({text:'合成资料原文'})).text,'合成资料原文')
  assert.equal(readablePreview(JSON.stringify({text:'<img onerror=alert(1)>'})).text,'<img onerror=alert(1)>')
})
