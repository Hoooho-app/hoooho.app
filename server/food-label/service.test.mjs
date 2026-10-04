import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { FoodLabelService,normalizePhoto,parseLabelText,foodFailureMessage,mergeRows } from './service.mjs'
test('actual model failures explain the failure without requesting label completion',()=>{
  for(const code of ['AI_TIMEOUT','AI_OUTPUT_INVALID','AI_OUTPUT_EMPTY','AI_OUTPUT_INCOMPLETE','UNKNOWN'])assert.doesNotMatch(foodFailureMessage({code}),/补拍|未完整|安全/)
})
const input={memberId:'a',taskId:'food-label-task-1',photos:[{dataUrl:`data:image/png;base64,${(await sharp({create:{width:100,height:100,channels:3,background:'#fff'}}).png().toBuffer()).toString('base64')}`} ]}
const page={text:'Ingredients: Water, Whey, Egg. Contains: Milk. May contain soy.',status:'readable'}
const translated={ingredients:[{original:'Water',chinese:'水',reliable:true,sourceUnknown:false},{original:'Whey',chinese:'乳清',reliable:true,sourceUnknown:false},{original:'Egg',chinese:'鸡蛋',reliable:true,sourceUnknown:false}],contains:[{original:'Milk',chinese:'牛奶',reliable:true,sourceUnknown:false}],advisory:[{original:'May contain soy',chinese:'可能含有大豆',reliable:true,sourceUnknown:false}]}
const records=[{name:'牛奶',category:'food',currentStatus:'confirmed'},{name:'鸡蛋',category:'food',currentStatus:'suspected'}]
test('actual partial read failure is distinct from a successfully read partial label',async()=>{
  const s=service([page,Object.assign(new Error('Invalid output'),{code:'AI_OUTPUT_INVALID'}),translated])
  const other={dataUrl:`data:image/png;base64,${(await sharp({create:{width:101,height:100,channels:3,background:'#fff'}}).png().toBuffer()).toString('base64')}`}
  const r=await s.service.analyze('owner',{...input,photos:[...input.photos,other]})
  assert.equal(r.failure,'read');assert.equal(r.ingredients.length,3);assert.equal(r.conflictCount,1)
  const partial=service([page,translated],{text:'声明范围缺失',status:'uncertain'})
  assert.equal((await partial.service.analyze('owner',input)).failure,null)
})
test('a clear partial ingredient list without its heading remains readable, not nutrition or claims',()=>{
  assert.equal(parseLabelText('大米、白砂糖、牛奶','readable').ingredients,'大米、白砂糖、牛奶')
  assert.equal(parseLabelText('Water, Sugar, Milk','readable').ingredients,'Water, Sugar, Milk')
  for(const text of ['Nutrition facts: Fat, Protein, 12 g','May contain milk, eggs','Milk-free, Gluten-free','Storage: cool, dry place'])assert.equal(parseLabelText(text,'readable').ingredients,'')
})
test('translation returns packaging language and English without changing original or diagnosis',async()=>{
  const t={...translated,ingredients:translated.ingredients.map(r=>({...r,english:r.original,sourceLanguage:'en'}))}
  const s=service([page,t]);const r=await s.service.analyze('owner',input)
  assert.equal(r.ingredients[0].english,'Water');assert.equal(r.ingredients[0].sourceLanguage,'en');assert.equal(r.conflictCount,1)
})
test('supplement deduplicates repeated ingredients without losing compound child paths',async()=>{
  const text={text:'Ingredients: Water, Blend (Milk, Salt), Sugar',status:'readable'}
  const tail={text:'Ingredients: Sugar, Water, Blend (Milk, Salt), Egg',status:'readable'}
  const names=['Water','Blend (Milk, Salt)','Milk','Salt','Sugar','Egg']
  const t={ingredients:names.map(original=>({original,chinese:original,reliable:true,sourceUnknown:false})),contains:[],advisory:[]}
  const other={dataUrl:`data:image/png;base64,${(await sharp({create:{width:101,height:100,channels:3,background:'#fff'}}).png().toBuffer()).toString('base64')}`}
  const s=service([text,tail,t]);const r=await s.service.analyze('owner',{...input,photos:[...input.photos,other]})
  assert.deepEqual(r.ingredients.map(row=>row.original),names)
  assert.equal(r.ingredients[2].parent,1);assert.equal(r.conflictCount,1)
})
function service(values,coverage={text:'完整范围',status:'readable'}){let calls=0;return {service:new FoodLabelService({members:{get:async(_a,m)=>{if(m!=='a')throw Object.assign(new Error('Not owned'),{status:404})}},readRecords:async()=>records,model:{structured:async({task,samplingTemperature})=>{assert.equal(samplingTemperature,0);if(task==='food-label-coverage'){if(coverage instanceof Error)throw coverage;return {value:coverage,diagnostics:{success:true}}}let value=values[calls++];if(value instanceof Error)throw value;if(task==='food-label-translate'&&value?.ingredients)value=Object.fromEntries(Object.entries(value).map(([key,rows])=>[key,rows.map(row=>({...row,english:row.english??'',sourceLanguage:row.sourceLanguage??(/\p{Script=Han}/u.test(row.original)?'zh':'en')}))]));return {value,diagnostics:{success:true}}}}}),calls:()=>calls}}
test('identical normalized photos are read once within a request, never reuse a previous task',async()=>{
  const s=service([page,translated,page,translated]);const photos=[...input.photos,...input.photos]
  for(let i=0;i<2;i++){const r=await s.service.analyze('owner',{...input,photos});assert.equal(r.ingredients.length,3);assert.equal(r.previews.length,2);assert.equal(r.diagnostics.calls,3)}
  assert.equal(s.calls(),4)
})
test('omitted display translation fields are an honest translation failure, not fabricated English',async()=>{
  const s=service([]);s.service.model.structured=async({task})=>({value:task==='food-label-read'?page:task==='food-label-coverage'?{text:'完整范围',status:'readable'}:translated,diagnostics:{success:true}})
  const r=await s.service.analyze('owner',input);assert.equal(r.failure,'translation');assert.ok(r.ingredients.every(row=>!row.english));assert.equal(r.ingredients.length,3)
})
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
test('uncertain OCR does not become certain just because translation succeeds',async()=>{const s=service([{...page,status:'uncertain'},translated]);const r=await s.service.analyze('owner',input);assert.equal(r.conflictCount,0);assert.ok(r.ingredients.every(row=>row.status==='clear'&&row.hits.length===0))})
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
test('uncertain ingredient name forbids a complete result even with clear photo coverage',async()=>{const t={...translated,ingredients:translated.ingredients.map((r,i)=>({...r,reliable:i!==0}))};const s=service([page,t]);const r=await s.service.analyze('owner',input);assert.equal(r.complete,false);assert.equal(r.ingredients[0].hits.length,0);assert.equal(r.ingredients[1].status,'known')})

test('archive load failure retains read ingredients but never reports zero completed conflicts',async()=>{
  const s=service([page,translated]);s.service.readRecords=async()=>{throw new Error('synthetic storage failure')}
  const r=await s.service.analyze('owner',input)
  assert.equal(r.displayIngredients.length,3);assert.equal(r.assessmentComplete,false);assert.equal(r.conflictCount,null)
  assert.equal(r.failure,'profile');assert.equal(r.checkErrorCode,'FOOD_PROFILE_UNAVAILABLE')
  assert.equal(r.labelEvidence[0].text,'Water, Whey, Egg')
})

test('photo dedup never confuses a substring, child, or differently composed parent with the same root',()=>{
  const merge=texts=>mergeRows(texts.map(ingredients=>({ingredients,readable:true}))).rows
  const rows=merge(['Bread (Milk, Salt), Rice','Milk, Rice, Bread (Water, Yeast)'])
  assert.equal(rows.filter(r=>r.parent===null).length,4)
  assert.equal(rows.filter(r=>r.name==='Milk').length,2)
  const repeated=merge(['Bread (Milk, Salt), Rice','Rice, Bread (Milk, Salt)'])
  assert.equal(repeated.filter(r=>r.parent===null).length,2)
  assert.deepEqual(repeated[0].evidence.photoIndices,[0,1])
  assert.equal(merge(['Rice (20%)','Rice (60%)']).length,2)
})
