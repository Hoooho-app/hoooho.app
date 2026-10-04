import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { FoodLabelService,normalizePhoto,parseLabelText } from './service.mjs'
const input={memberId:'a',taskId:'food-label-task-1',photos:[{dataUrl:`data:image/png;base64,${(await sharp({create:{width:100,height:100,channels:3,background:'#fff'}}).png().toBuffer()).toString('base64')}`} ]}
const page={text:'Ingredients: Water, Whey, Egg. Contains: Milk. May contain soy.',status:'readable'}
const translated={ingredients:[{original:'Water',chinese:'水',reliable:true,sourceUnknown:false},{original:'Whey',chinese:'乳清',reliable:true,sourceUnknown:false},{original:'Egg',chinese:'鸡蛋',reliable:true,sourceUnknown:false}],contains:[{original:'Milk',chinese:'牛奶',reliable:true,sourceUnknown:false}],advisory:[{original:'May contain soy',chinese:'可能含有大豆',reliable:true,sourceUnknown:false}]}
const records=[{name:'牛奶',category:'food',currentStatus:'confirmed'},{name:'鸡蛋',category:'food',currentStatus:'suspected'}]
function service(values,coverage={text:'完整范围',status:'readable'}){let calls=0;return {service:new FoodLabelService({members:{get:async(_a,m)=>{if(m!=='a')throw Object.assign(new Error('Not owned'),{status:404})}},readRecords:async()=>records,model:{structured:async({task})=>{if(task==='food-label-coverage'){if(coverage instanceof Error)throw coverage;return {value:coverage,diagnostics:{success:true}}}const value=values[calls++];if(value instanceof Error)throw value;return {value,diagnostics:{success:true}}}}}),calls:()=>calls}}
test('complete source goes through image decode, independent coverage, translation and deterministic rules',async()=>{const s=service([page,translated]);const r=await s.service.analyze('owner',input);assert.equal(r.ingredients.length,3);assert.equal(r.conflictCount,1);assert.equal(r.ingredients[2].status,'possible');assert.equal(r.advisory.length,1);assert.equal(r.diagnostics.calls,3)})
test('clear partial labels retain known red without a complete or green conclusion',async()=>{const s=service([page,translated],{text:'声明范围缺失',status:'uncertain'});const r=await s.service.analyze('owner',input);assert.equal(r.ingredients[1].status,'known');assert.equal(r.complete,false);assert.notEqual(r.tone,'success')})
test('coverage failure retains all clear ingredients and forbids a complete result',async()=>{const s=service([page,translated],Object.assign(new Error('Timeout'),{code:'AI_TIMEOUT'}));const r=await s.service.analyze('owner',input);assert.equal(r.ingredients.length,3);assert.equal(r.ingredients[1].status,'known');assert.equal(r.complete,false);assert.deepEqual(r.diagnostics.errorCodes,['AI_TIMEOUT'])})
test('a foreign member is rejected before provider calls',async()=>{const s=service([]);await assert.rejects(()=>s.service.analyze('owner',{...input,memberId:'b'}),{status:404});assert.equal(s.calls(),0)})
test('model candidate fields cannot replace deterministic OCR source extraction',async()=>{const s=service([{...page,ingredients:'Fabricated milk'}]);await assert.rejects(()=>s.service.analyze('owner',input),{code:'FOOD_READ_INVALID'})})
test('translation missing an item retains every original and known milk red, never success',async()=>{const s=service([page,{...translated,ingredients:translated.ingredients.slice(0,2)}]);const r=await s.service.analyze('owner',input);assert.equal(r.ingredients.length,3);assert.equal(r.ingredients[1].status,'known');assert.equal(r.complete,false);assert.deepEqual(r.diagnostics.errorCodes,['FOOD_TRANSLATION_INCOMPLETE'])})
test('blank/front label cannot produce a passing result',async()=>{const s=service([{text:'Front label with Nutrition facts',status:'uncertain'}]);await assert.rejects(()=>s.service.analyze('owner',input),{code:'FOOD_NO_INGREDIENTS'})})
test('member archive absence never makes an empty record a green result',async()=>{const s=service([page,translated]);s.service.readRecords=async()=>[];const r=await s.service.analyze('owner',input);assert.equal(r.profileAvailable,false);assert.notEqual(r.tone,'success')})
test('abort before call performs no upstream request',async()=>{const s=service([]),controller=new AbortController();controller.abort();await assert.rejects(()=>s.service.analyze('owner',input,controller.signal));assert.equal(s.calls(),0)})
test('selected member changes invalidate an older task',async()=>{const s=service([page,translated]);let reads=0;s.service.currentMember=async()=>++reads===1?'a':'other';await assert.rejects(()=>s.service.analyze('owner',input),{code:'FOOD_MEMBER_CHANGED'})})
test('unselected legacy self context can read a label without green profile claims',async()=>{const s=service([page,translated]);const r=await s.service.analyze('owner',{...input,memberId:'self'});assert.equal(r.profileAvailable,false);assert.notEqual(r.tone,'success')})
test('uncertain OCR does not become certain just because translation succeeds',async()=>{const s=service([{...page,status:'uncertain'},translated]);const r=await s.service.analyze('owner',input);assert.equal(r.conflictCount,0);assert.ok(r.ingredients.every(row=>row.status==='pending'))})
test('JPEG EXIF orientation is applied without cropping label text',async()=>{
  const photo=await sharp({create:{width:200,height:100,channels:3,background:'#fff'}}).jpeg().withMetadata({orientation:6}).toBuffer()
  const normalized=await normalizePhoto({dataUrl:'data:image/jpeg;base64,'+photo.toString('base64')})
  const metadata=await sharp(Buffer.from(normalized.dataUrl.split(',')[1],'base64')).metadata()
  assert.equal(metadata.width,100);assert.equal(metadata.height,200)
})
test('May contain and milk-free cannot be promoted to an explicit Contains declaration',async()=>{
  for(const text of ['Ingredients: Water. May contain milk.','Ingredients: Water. Milk-free.']){
    const parsed=parseLabelText(text,'uncertain');assert.equal(parsed.contains.length,0)
  }
})
test('Chinese label extraction retains compound source and excludes nutrition/positive warnings',()=>{const r=parseLabelText('配料表：水、奶粉（全脂奶粉、乳糖）、黄原胶。\n本产品含有牛奶。\n可能含有鸡蛋。\n营养成分表', 'readable');assert.equal(r.ingredients,'水、奶粉（全脂奶粉、乳糖）、黄原胶');assert.deepEqual(r.contains,['牛奶']);assert.deepEqual(r.advisory,['可能含有鸡蛋'])})
test('including lactose declaration is positive source evidence, not an unknown ingredient',async()=>{
  const p={text:'配料表：乳糖。\n本产品含有乳及乳制品（包括乳糖）。',status:'readable'}
  const t={ingredients:[{original:'乳糖',chinese:'乳糖',reliable:true,sourceUnknown:false}],contains:[{original:'乳及乳制品',chinese:'乳及乳制品',reliable:true,sourceUnknown:false},{original:'乳糖',chinese:'乳糖',reliable:true,sourceUnknown:false}],advisory:[]}
  const s=service([p,t]);const result=await s.service.analyze('owner',input)
  assert.equal(result.ingredients[0].status,'known');assert.equal(result.contains.length,0);assert.equal(result.pendingCount,0)
})
test('contradictory coverage markers are rejected without weakening completeness',async()=>{const s=service([page,translated],{text:'配料缺失',status:'readable'});const r=await s.service.analyze('owner',input);assert.equal(r.complete,false);assert.deepEqual(r.diagnostics.errorCodes,['FOOD_COVERAGE_INVALID'])})
test('uncertain ingredient name forbids a complete result even with clear photo coverage',async()=>{const t={...translated,ingredients:translated.ingredients.map((r,i)=>({...r,reliable:i!==0}))};const s=service([page,t]);const r=await s.service.analyze('owner',input);assert.equal(r.complete,false);assert.match(r.scope,/中文对照未可靠确认/);assert.equal(r.ingredients[1].status,'known')})
