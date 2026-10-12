import test from 'node:test'
import assert from 'node:assert/strict'
import {readablePreview,quarantinePreview} from './readable-preview.mjs'
import observed from './fixtures/bailian-synthetic-ocr-array-20261003.json' with {type:'json'}
test('真实合成OCR数组回放仅投影文字，原JSON和状态字段不直接展示',()=>{
 const preview=readablePreview(observed.content,{provider:'bailian',model:'qwen3.7-plus',...observed})
 assert.equal(preview.text,JSON.parse(observed.content)[0].text);assert.equal(preview.requestId,observed.requestId)
 assert.doesNotMatch(preview.text,/"text"|"status"|^\[/)
 assert.equal(quarantinePreview(preview,{stage:'schema_validation',fieldPath:'/',reason:'type'}).status,'unverified')
 for(const invalid of ['[]','[{}]','[[{"text":"合成"}]]','"{\\"text\\":\\"合成\\"}"'])assert.equal(readablePreview(invalid),null)
})
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

test('目前情况只投影白名单事实及引用，严格限量且始终是未验证预览',()=>{
 const row={text:'有点头晕，无头痛。',quote:'只是有点头晕，没有头痛',sourceId:'private-source',emphasis:['ignored-hint'],label:'皮肤',note:'家长猜测是痱子。',noteQuote:'我估计是痱子',thought:'private-reasoning'}
 const p=readablePreview(JSON.stringify({currentSituation:{description:[row],symptoms:[row],diet:[],changes:[],treatment:[],keywords:[],tools:['private-tool']},unknown:'private-extra'}),{provider:'bailian'})
 assert.match(p.text,/有点头晕，无头痛/);assert.match(p.text,/家长猜测/);assert.match(p.text,/备注引用（未验证）：我估计是痱子/)
 assert.doesNotMatch(p.text,/private-|ignored-hint|sourceId|"currentSituation"|thought|tools/)
 const q=quarantinePreview(p,{stage:'source_validation',fieldPath:'/currentSituation/symptoms/0/noteQuote'})
 assert.equal(q.status,'unverified');assert.match(q.warning,/不会自动保存/)
 for(const currentSituation of [{description:Array(7).fill(row)},{symptoms:Array(13).fill(row)},{diet:'invalid'},{description:['invalid']},{description:[{text:123}]},{symptoms:[{...row,note:{unknown:'invalid'}}]},{description:[{text:'x'.repeat(24001)}]}])assert.equal(readablePreview(JSON.stringify({currentSituation})),null)
 for(const text of ['Bearer synthetic','sk-synthetic','PRIVATE KEY'])assert.equal(readablePreview(JSON.stringify({currentSituation:{description:[{text}]}})),null)
})
