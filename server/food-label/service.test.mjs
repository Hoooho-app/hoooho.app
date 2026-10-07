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

test('screenshot OCR explicitly separates interface icons from printed ingredient text',async()=>{
 const requests=[];const model={structured:async request=>{requests.push(request);throw Object.assign(new Error('fixture'),{code:'AI_OUTPUT_INVALID'})}}
 const service=new FoodLabelService({model,members:{get:async()=>{}},readRecords:async()=>[]})
 await assert.rejects(()=>service.analyze('owner',input),{code:'AI_OUTPUT_INVALID'})
 assert.match(requests[0].instructions,/图标不是配料文字/)
 assert.match(requests[0].instructions,/不能把.*符号.*拼到成分名/)
})
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
function service(values){let calls=0;return {service:new FoodLabelService({members:{get:async(_a,m)=>{if(m!=='a')throw Object.assign(new Error('Not owned'),{status:404})}},readRecords:async()=>records,model:{structured:async({task,samplingTemperature})=>{assert.equal(samplingTemperature,0);assert.notEqual(task,'food-label-coverage');let value=values[calls++];if(value instanceof Error)throw value;if(task==='food-label-translate'&&value?.ingredients)value=Object.fromEntries(Object.entries(value).map(([key,rows])=>[key,rows.map(row=>({...row,english:row.english??'',sourceLanguage:row.sourceLanguage??(/\p{Script=Han}/u.test(row.original)?'zh':'en')}))]));return {value,diagnostics:{success:true}}}}}),calls:()=>calls}}
test('identical normalized photos are read once within a request, never reuse a previous task',async()=>{
  const s=service([page,translated,page,translated]);const photos=[...input.photos,...input.photos]
  for(let i=0;i<2;i++){const r=await s.service.analyze('owner',{...input,photos});assert.equal(r.ingredients.length,3);assert.equal(r.previews.length,2);assert.equal(r.diagnostics.calls,2)}
  assert.equal(s.calls(),4)
})
test('omitted display translation fields are an honest translation failure, not fabricated English',async()=>{
  const s=service([]);s.service.model.structured=async({task})=>({value:task==='food-label-read'?page:task==='food-label-coverage'?{text:'完整范围',status:'readable'}:translated,diagnostics:{success:true}})
  const r=await s.service.analyze('owner',input);assert.equal(r.failure,'translation');assert.ok(r.ingredients.every(row=>row.english===row.original&&!row.chinese));assert.equal(r.ingredients.length,3)
})
test('foreign source uses one image read, one translation and deterministic rules',async()=>{const s=service([page,translated]);const r=await s.service.analyze('owner',input);assert.equal(r.ingredients.length,3);assert.equal(r.conflictCount,1);assert.equal(r.ingredients[2].status,'possible');assert.equal(r.advisory.length,1);assert.equal(r.diagnostics.calls,2)})
test('clear partial labels retain known red without a complete or green conclusion',async()=>{const s=service([page,translated],{text:'声明范围缺失',status:'uncertain'});const r=await s.service.analyze('owner',input);assert.equal(r.ingredients[1].status,'known');assert.equal(r.complete,false);assert.notEqual(r.tone,'success')})
test('a foreign member is rejected before provider calls',async()=>{const s=service([]);await assert.rejects(()=>s.service.analyze('owner',{...input,memberId:'b'}),{status:404});assert.equal(s.calls(),0)})
test('model candidate fields cannot replace deterministic OCR source extraction',async()=>{const s=service([{...page,ingredients:'Fabricated milk'}]);await assert.rejects(()=>s.service.analyze('owner',input),{code:'FOOD_READ_INVALID'})})
test('translation missing an item retains every original and known milk red, never success',async()=>{const s=service([page,{...translated,ingredients:translated.ingredients.slice(0,2)}]);const r=await s.service.analyze('owner',input);assert.equal(r.ingredients.length,3);assert.equal(r.ingredients[1].status,'known');assert.equal(r.complete,false);assert.deepEqual(r.diagnostics.errorCodes,['FOOD_TRANSLATION_INCOMPLETE'])})
test('blank/front label cannot produce a passing result',async()=>{const s=service([{text:'Front label with Nutrition facts',status:'uncertain'}]);await assert.rejects(()=>s.service.analyze('owner',input),{code:'FOOD_NO_INGREDIENTS'})})
test('member archive absence never makes an empty record a green result',async()=>{const s=service([page,translated]);s.service.readRecords=async()=>[];const r=await s.service.analyze('owner',input);assert.equal(r.profileAvailable,false);assert.notEqual(r.tone,'success')})
test('abort before call performs no upstream request',async()=>{const s=service([]),controller=new AbortController();controller.abort();await assert.rejects(()=>s.service.analyze('owner',input,controller.signal));assert.equal(s.calls(),0)})
test('selected member changes invalidate an older task',async()=>{const s=service([page,translated]);let reads=0;s.service.currentMember=async()=>++reads===1?'a':'other';await assert.rejects(()=>s.service.analyze('owner',input),{code:'FOOD_MEMBER_CHANGED'})})
test('unselected legacy self context can read a label without green profile claims',async()=>{const s=service([page,translated]);const r=await s.service.analyze('owner',{...input,memberId:'self'});assert.equal(r.profileAvailable,false);assert.notEqual(r.tone,'success')})
test('uncertain OCR does not become certain just because translation succeeds',async()=>{const s=service([{...page,status:'uncertain'},translated]);const r=await s.service.analyze('owner',input);assert.equal(r.conflictCount,0);assert.ok(r.ingredients.every(row=>row.status==='pending'&&row.hits.length===0))})
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
test('translation cannot introduce a conflict into an unmatched original name',async()=>{const t={...translated,ingredients:translated.ingredients.map((r,i)=>({...r,reliable:i!==0}))};const s=service([page,t]);const r=await s.service.analyze('owner',input);assert.equal(r.complete,false);assert.equal(r.ingredients[0].hits.length,0);assert.equal(r.ingredients[1].status,'known')})

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

const secondPhoto={dataUrl:`data:image/png;base64,${(await sharp({create:{width:102,height:100,channels:3,background:'#eee'}}).png().toBuffer()).toString('base64')}`}
test('same-language Chinese label skips translation and coverage, retaining eight parents and every additive child',async()=>{
  const s=service([{text:'配料表：大米（≥60%）、白砂糖、植物油（含特丁基对苯二酚）、米粉、淀粉、食用盐、食品添加剂（明胶、5′-呈味核苷酸二钠）、味精',status:'readable'}])
  const r=await s.service.analyze('owner',input)
  assert.equal(r.diagnostics.calls,1);assert.equal(r.displayIngredients.length,8);assert.equal(r.displayIngredients[6].children.length,2)
  assert.ok(r.displayIngredients.every(row=>row.status==='clear'));assert.equal(r.conflictCount,0);assert.equal(r.complete,false)
  for(const value of Object.values(r.diagnostics.timings))assert.ok(Number.isFinite(value)&&value>=0)
})
test('same-language English uses one read and preserves confirmed allergy matching independently of Chinese translation',async()=>{
  const s=service([page]);const r=await s.service.analyze('owner',{...input,language:'en'})
  assert.equal(r.diagnostics.calls,1);assert.equal(r.conflictCount,1);assert.equal(r.displayIngredients[1].status,'known');assert.equal(r.displayIngredients[2].status,'possible')
})
test('incremental supplement reads only the new photo, keeps parent evidence indices, and reloads current personal records',async()=>{
  const s=service([page,{text:'Ingredients: Water, Bread (Milk, Salt), Sugar',status:'readable'}])
  let activeRecords=records;s.service.readRecords=async()=>activeRecords
  const first=await s.service.analyze('owner',{...input,language:'en'})
  activeRecords=[{name:'牛奶',category:'food',currentStatus:'suspected'}]
  const next=await s.service.analyze('owner',{...input,taskId:'supplement-task-2',scanId:input.taskId,language:'en',photos:[secondPhoto],continuation:first.continuation})
  assert.equal(s.calls(),2);assert.equal(next.diagnostics.calls,1);assert.equal(next.previews.length,2);assert.equal(next.conflictCount,0)
  assert.deepEqual(next.displayIngredients.map(row=>row.original),['Water','Whey','Egg','Bread (Milk, Salt)','Sugar'])
  assert.equal(next.displayIngredients[1].status,'possible');assert.deepEqual(next.displayIngredients[3].evidence.photoIndices,[1])
  assert.deepEqual(next.displayIngredients[0].evidence.photoIndices,[0,1])
})
test('an identical supplemental photo performs zero model calls, but repeats current member checks',async()=>{
  const s=service([page]);const first=await s.service.analyze('owner',{...input,language:'en'})
  const next=await s.service.analyze('owner',{...input,language:'en',continuation:first.continuation})
  assert.equal(next.diagnostics.calls,0);assert.equal(s.calls(),1);assert.equal(next.previews.length,2)
  assert.deepEqual(next.displayIngredients,first.displayIngredients)
})
test('incremental foreign labels translate only new names and retain the existing translations',async()=>{
  const s=service([page,translated,{text:'Ingredients: Water, Sugar',status:'readable'},{ingredients:[{original:'Sugar',chinese:'白砂糖',reliable:true,sourceUnknown:false}],contains:[],advisory:[]}])
  const first=await s.service.analyze('owner',input)
  const next=await s.service.analyze('owner',{...input,photos:[secondPhoto],continuation:first.continuation})
  assert.equal(next.diagnostics.calls,2);assert.equal(next.displayIngredients.length,4)
  assert.equal(next.displayIngredients[1].chinese,'乳清');assert.equal(next.displayIngredients[3].chinese,'白砂糖')
})
test('continuations reject tampering, another owner/member/scan and expiry before new model calls',async()=>{
  let now=1;const s=service([page]);s.service.continuation=new (await import('./continuation.mjs')).FoodLabelContinuation({now:()=>now,ttlMs:10})
  const first=await s.service.analyze('owner',{...input,language:'en'})
  for(const changes of [{continuation:first.continuation.slice(0,-10)+'AAAAAAAAAA'},{scanId:'different-scan-1'}])await assert.rejects(()=>s.service.analyze('owner',{...input,language:'en',continuation:first.continuation,...changes}),{code:'FOOD_CONTINUATION_EXPIRED'})
  await assert.rejects(()=>s.service.analyze('other-owner',{...input,language:'en',continuation:first.continuation}),{code:'FOOD_CONTINUATION_EXPIRED'})
  s.service.members.get=async()=>{}
  await assert.rejects(()=>s.service.analyze('owner',{...input,memberId:'other-member',continuation:first.continuation}),{code:'FOOD_CONTINUATION_EXPIRED'})
  now=11
  await assert.rejects(()=>s.service.analyze('owner',{...input,continuation:first.continuation}),{code:'FOOD_CONTINUATION_EXPIRED'})
  assert.equal(s.calls(),1)
})
test('new service process rejects previous continuation and total photo limit spans supplements',async()=>{
  const s=service([page]);const first=await s.service.analyze('owner',{...input,language:'en',photos:Array(6).fill(input.photos[0])})
  await assert.rejects(()=>s.service.analyze('owner',{...input,language:'en',continuation:first.continuation}),{code:'FOOD_PHOTO_LIMIT'})
  const restarted=service([])
  await assert.rejects(()=>restarted.service.analyze('owner',{...input,continuation:first.continuation}),{code:'FOOD_CONTINUATION_EXPIRED'})
  assert.equal(restarted.calls(),0)
})
test('profile failure makes otherwise clear ingredient checks incomplete and does not create completed zero conflicts',async()=>{
  const s=service([{text:'配料表：大米、食用盐',status:'readable'}]);s.service.readRecords=async()=>{throw new Error('unavailable')}
  const r=await s.service.analyze('owner',input)
  assert.equal(r.conflictCount,null);assert.ok(r.displayIngredients.every(row=>row.status==='pending'))
})
