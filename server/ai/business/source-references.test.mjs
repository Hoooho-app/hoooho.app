// Complete proposed module: server/ai/business/source-references.test.mjs
// Public contract agreed with summary_model_review; original validators remain
// responsible for clinical truth, ownership, dates, literal values, and units.
import test from 'node:test'
import assert from 'node:assert/strict'
import {buildSourceReferenceContract} from './source-references.mjs'
import {extractionSchema,validateExtraction} from './contract.mjs'
import {groundNursingEvidence} from './nursing-evidence.mjs'

const referenceSource=(text,patch={})=>({id:'input',page:1,text,status:'readable',sourceKind:'user_text',...patch})
const referenceItem=(fields,patch={})=>({category:'symptom',title:'观察记录',subject:'current',timeText:null,archiveCategory:null,relationKey:null,fields,...patch})
const referenceOutput=(fields,patch={})=>({items:[referenceItem(fields,patch)]})
const referenceField=(segment,value,patch={})=>({name:'symptom',value,evidenceId:segment.evidenceId,...patch})
const fieldSchema=c=>c.schema.properties.items.items.properties.fields.items
const invalidReference=e=>e?.code==='AI_SOURCE_REFERENCE_INVALID'&&e.status===422
const ambiguousReference=e=>e?.code==='AI_SOURCE_REFERENCE_AMBIGUOUS'&&e.status===422
const literalField=(value,patch={})=>({name:'symptom',value,sourceId:'input',page:1,quote:value,...patch})

test('reference schema exposes only enumerated evidence IDs and does not mutate the legacy schema or supplied sources',()=>{
 const sources=[referenceSource('独特原始输入：今天右脚皮肤破损。')],beforeSources=structuredClone(sources),beforeSchema=structuredClone(extractionSchema)
 const c=buildSourceReferenceContract(extractionSchema,sources),s=fieldSchema(c)
 assert.deepEqual(s.required.slice().sort(),['evidenceId','name','value'])
 assert.equal(s.additionalProperties,false)
 assert.deepEqual(s.properties.evidenceId.enum,c.sourceSegments.map(s=>s.evidenceId))
 for(const key of ['sourceId','page','quote'])assert.equal(s.properties[key],undefined)
 assert.deepEqual(s.properties.name,extractionSchema.properties.items.items.properties.fields.items.properties.name)
 assert.deepEqual(s.properties.value,extractionSchema.properties.items.items.properties.fields.items.properties.value)
 assert.deepEqual(sources,beforeSources);assert.deepEqual(extractionSchema,beforeSchema)
 assert.equal(JSON.stringify(c.schema).includes('独特原始输入'),false,'schema must not repeat the full source text')
})

test('segments preserve every original source exactly once in original order without dropping punctuation, whitespace or empty-page identity',()=>{
 const sources=[
  referenceSource('  第一行\r\n第二行。\n尾行  '),
  referenceSource('',{id:'report',page:1,sourceKind:'document_text'}),
  referenceSource('报告第2页；药量0.5 mg。',{id:'report',page:2,sourceKind:'document_text'}),
  referenceSource('照片可见：局部破皮。',{id:'photo',sourceKind:'visual_observation'}),
 ]
 const c=buildSourceReferenceContract(extractionSchema,sources),ids=new Set()
 let previousSourceIndex=-1,total=0
 for(const segment of c.sourceSegments){
  const index=sources.findIndex(s=>s.id===segment.sourceId&&s.page===segment.page),source=sources[index]
  assert.ok(index>=previousSourceIndex);previousSourceIndex=index
  assert.equal(segment.text,source.text.slice(segment.start,segment.end));assert.equal(segment.sourceKind,source.sourceKind)
  assert.ok(segment.end>segment.start&&segment.text.length<=1000)
  assert.ok(!ids.has(segment.evidenceId));ids.add(segment.evidenceId);total+=segment.text.length
 }
 for(const source of sources){
  const segments=c.sourceSegments.filter(s=>s.sourceId===source.id&&s.page===source.page)
  let offset=0
  for(const segment of segments){assert.equal(segment.start,offset);offset=segment.end}
  assert.equal(offset,source.text.length);assert.equal(segments.map(s=>s.text).join(''),source.text)
 }
 assert.equal(total,sources.reduce((n,s)=>n+s.text.length,0),'non-overlapping input must not repeat full source text')
})

test('long Unicode sources preserve exact code units and never split a surrogate pair or normalize source spelling',()=>{
 const text='甲'.repeat(999)+'👣'+'e\u0301 ３８．５℃\u200b\r\n'+'乙'.repeat(5200)+'终。',source=referenceSource(text)
 const c=buildSourceReferenceContract(extractionSchema,[source])
 assert.ok(text.length>4000);assert.equal(c.sourceSegments.map(s=>s.text).join(''),text)
 for(const segment of c.sourceSegments){
  assert.ok(segment.text.length<=1000)
  assert.equal(/[\uD800-\uDBFF]$/u.test(segment.text),false,'no dangling high surrogate')
  assert.equal(/^[\uDC00-\uDFFF]/u.test(segment.text),false,'no dangling low surrogate')
 }
})

test('hydration preserves name/value and caller output, while restoring only server-owned source ID, page and literal quote',()=>{
 const source=referenceSource('原始值：38.5℃。',{id:'report',page:3}),c=buildSourceReferenceContract(extractionSchema,[source]),segment=c.sourceSegments[0]
 const value=' 38.5℃ ',output=referenceOutput([referenceField(segment,value,{name:'result'})],{category:'measurement'}),before=structuredClone(output)
 const hydrated=c.decode(output),field=hydrated.items[0].fields[0]
 assert.equal(field.name,'result');assert.equal(field.value,value,'binding must not trim, normalize or fix a value')
 assert.equal(field.sourceId,'report');assert.equal(field.page,3);assert.equal(field.evidenceId,undefined)
 assert.ok(source.text.includes(field.quote));assert.ok(field.quote.length<=4000)
 assert.deepEqual(output,before)
})

test('issued IDs bind an immutable source snapshot and cannot be redirected by public registry or source mutation',()=>{
 const sources=[referenceSource('宝宝咳嗽。')],c=buildSourceReferenceContract(extractionSchema,sources),id=c.sourceSegments[0].evidenceId
 sources[0].id='other';sources[0].page=99;sources[0].text='妈妈头痛。'
 c.sourceSegments[0].sourceId='other';c.sourceSegments[0].text='妈妈头痛。'
 const field=c.decode(referenceOutput([{name:'symptom',value:'咳嗽',evidenceId:id}])).items[0].fields[0]
 assert.equal(field.sourceId,'input');assert.equal(field.page,1);assert.equal(field.quote,'宝宝咳嗽。')
 const original=buildSourceReferenceContract(extractionSchema,[referenceSource('宝宝咳嗽。')])
 assert.equal(original.sourceSegments[0].evidenceId,id)
 for(const patch of [{text:'宝宝没有咳嗽。'},{id:'different'},{page:2},{sourceKind:'visual_observation'}]){
  const changed=buildSourceReferenceContract(extractionSchema,[referenceSource('宝宝咳嗽。',patch)])
  assert.notEqual(changed.sourceSegments[0].evidenceId,id)
  assert.throws(()=>changed.decode(referenceOutput([{name:'symptom',value:'咳嗽',evidenceId:id}])),invalidReference)
 }
})

test('identical text in different source pages remains bound to the selected original identity',()=>{
 const sources=[referenceSource('皮肤破损。',{id:'a',page:1}),referenceSource('皮肤破损。',{id:'a',page:2})],c=buildSourceReferenceContract(extractionSchema,sources)
 const selected=c.sourceSegments.find(s=>s.sourceId==='a'&&s.page===2)
 const field=c.decode(referenceOutput([referenceField(selected,'皮肤破损')])).items[0].fields[0]
 assert.equal(field.sourceId,'a');assert.equal(field.page,2);assert.equal(field.quote,'皮肤破损。')
 assert.notEqual(c.sourceSegments[0].evidenceId,c.sourceSegments[1].evidenceId)
 assert.throws(()=>buildSourceReferenceContract(extractionSchema,[sources[0],{...sources[0],text:'另一原文'}]),invalidReference)
})

test('a repeated segment expands to a unique contiguous original quote no longer than 4000',()=>{
 const source=referenceSource('甲'.repeat(1600)+'唯一A。'+'甲'.repeat(1600)+'唯一B。'),c=buildSourceReferenceContract(extractionSchema,[source])
 const repeated=c.sourceSegments.find(s=>source.text.indexOf(s.text)!==source.text.lastIndexOf(s.text))
 assert.ok(repeated)
 const field=c.decode(referenceOutput([referenceField(repeated,'甲')])).items[0].fields[0],start=source.text.indexOf(field.quote)
 assert.equal(start,source.text.lastIndexOf(field.quote));assert.ok(field.quote.length<=4000)
 assert.ok(start<=repeated.start&&start+field.quote.length>=repeated.end)
 assert.ok(field.quote.length>repeated.text.length)
})

test('an irreducibly repeated source cannot be guessed or truncated to invent a unique reference',()=>{
 const source=referenceSource('甲'.repeat(9000)),c=buildSourceReferenceContract(extractionSchema,[source]),segment=c.sourceSegments[Math.floor(c.sourceSegments.length/2)]
 assert.equal(c.sourceSegments.map(s=>s.text).join(''),source.text)
 assert.throws(()=>c.decode(referenceOutput([referenceField(segment,'甲')])),ambiguousReference)
})

test('a continuous literal value may span segments without being shortened or fetched from an unrelated distant segment',()=>{
 const value='【连续观察】'+'小脚趾皮肤破损，'.repeat(180)+'【观察结束】',source=referenceSource('甲'.repeat(750)+value+'乙'.repeat(900)),c=buildSourceReferenceContract(extractionSchema,[source])
 assert.ok(value.length>1000&&value.length<4000)
 const at=source.text.indexOf(value),selected=c.sourceSegments.find(s=>s.start<=at&&s.end>at)
 const field=c.decode(referenceOutput([referenceField(selected,value)])).items[0].fields[0]
 assert.equal(field.value,value);assert.ok(field.quote.includes(value));assert.ok(field.quote.length<=4000)
 assert.equal(source.text.indexOf(field.quote),source.text.lastIndexOf(field.quote))
 const distant=referenceSource('宝宝咳嗽。'+'甲'.repeat(2000)+'远处独立值。'),other=buildSourceReferenceContract(extractionSchema,[distant])
 assert.throws(()=>other.decode(referenceOutput([referenceField(other.sourceSegments[0],'远处独立值')])),error=>error.code==='AI_SOURCE_REFERENCE_INVALID'&&error.details.sourceReference.reason==='value_outside_segment')
})

test('a complete 4000-character literal remains representable within the existing quote bound',()=>{
 const value='起'+'甲'.repeat(3998)+'终',source=referenceSource('前。'+value+'。后'),c=buildSourceReferenceContract(extractionSchema,[source]),at=source.text.indexOf(value)
 const selected=c.sourceSegments.find(s=>s.start>=at&&s.end<=at+value.length)
 const decoded=c.decode(referenceOutput([referenceField(selected,value)])),field=decoded.items[0].fields[0]
 assert.equal(field.value,value);assert.equal(field.quote,value);assert.equal(field.quote.length,4000)
 assert.equal(validateExtraction(decoded,[source])[0].fields[0].value,value)
})

test('unknown, forged and prototype-like IDs are rejected without falling back to loose source text',()=>{
 const c=buildSourceReferenceContract(extractionSchema,[referenceSource('宝宝咳嗽。')])
 for(const id of ['not-issued','e_'+ '0'.repeat(32),'__proto__','constructor','',null,1,[]])assert.throws(()=>c.decode(referenceOutput([{name:'symptom',value:'咳嗽',evidenceId:id}])),invalidReference)
})

test('new and literal references cannot be mixed in one field, item, or extraction output',()=>{
 const c=buildSourceReferenceContract(extractionSchema,[referenceSource('宝宝咳嗽。')]),bound=referenceField(c.sourceSegments[0],'咳嗽'),legacy=literalField('咳嗽')
 for(const extra of [{sourceId:'input'},{page:1},{quote:'宝宝咳嗽。'}])assert.throws(()=>c.decode(referenceOutput([{...bound,...extra}])),invalidReference)
 assert.throws(()=>c.decode(referenceOutput([bound,legacy])),invalidReference)
 assert.throws(()=>c.decode({items:[referenceItem([bound]),referenceItem([legacy])]}),invalidReference)
 assert.throws(()=>c.decode(referenceOutput([{...bound,unexpected:'injected'}])),invalidReference)
})

test('legacy literal fields remain unchanged and still face the original strict quote validation',()=>{
 const source=referenceSource('没有呕吐，只是恶心。'),c=buildSourceReferenceContract(extractionSchema,[source])
 const legacy=referenceOutput([literalField('没有呕吐'),literalField('恶心')]),before=structuredClone(legacy)
 assert.deepEqual(c.decode(legacy),legacy);assert.deepEqual(legacy,before)
 assert.equal(validateExtraction(c.decode(legacy),[source]).length,1)
 const forged=referenceOutput([literalField('恶心',{quote:'孩子一直恶心'})])
 assert.deepEqual(c.decode(forged),forged)
 assert.throws(()=>validateExtraction(c.decode(forged),[source]),{code:'AI_EVIDENCE_MISMATCH'})
})

test('binding source IDs does not approve another person, clipped negation, or paraphrased observations',()=>{
 for(const [text,value] of [['妈妈今天咳嗽。','咳嗽'],['宝宝没有呕吐。','呕吐'],['脚小拇指破了。','足小趾皮肤破损']]){
  const source=referenceSource(text),c=buildSourceReferenceContract(extractionSchema,[source]),decoded=c.decode(referenceOutput([referenceField(c.sourceSegments[0],value)]))
  assert.equal(decoded.items[0].fields[0].value,value,'decode cannot repair the supplier value')
  assert.throws(()=>validateExtraction(decoded,[source]),{code:'AI_EVIDENCE_MISMATCH'})
 }
})

test('hydrated evidence still cannot attach yesterday hand to today foot, while correctly split dates remain valid',()=>{
 const source=referenceSource('今天右脚皮肤破损。昨天左手皮肤破损。'),sources=[source],c=buildSourceReferenceContract(extractionSchema,sources)
 const today=c.sourceSegments.find(s=>s.text.includes('今天')),yesterday=c.sourceSegments.find(s=>s.text.includes('昨天'))
 const context={referenceNow:'2026-10-26T08:00:00Z',timezone:'Asia/Shanghai'}
 const wrong=c.decode(referenceOutput([referenceField(yesterday,'昨天左手皮肤破损'),referenceField(today,'右脚',{name:'location'})],{timeText:'今天'}))
 assert.throws(()=>groundNursingEvidence(validateExtraction(wrong,sources),sources,context),{code:'AI_TIME_CONFLICT'})
 const correct=c.decode({items:[
  referenceItem([referenceField(today,'今天右脚皮肤破损')],{timeText:'今天'}),
  referenceItem([referenceField(yesterday,'昨天左手皮肤破损')],{timeText:'昨天'}),
 ]})
 assert.equal(groundNursingEvidence(validateExtraction(correct,sources),sources,context).length,2)
})

test('invented numbers, changed units and Unicode numeric normalization still fail the original literal value checks',()=>{
 for(const [text,value,name,category] of [
  ['原药量0.5 mg。','50 mg','doseOriginal','medication'],
  ['原药量0.5 mg。','0.5 mL','doseOriginal','medication'],
  ['体温３８．５℃。','38.5℃','result','measurement'],
 ]){
  const source=referenceSource(text),c=buildSourceReferenceContract(extractionSchema,[source]),decoded=c.decode(referenceOutput([referenceField(c.sourceSegments[0],value,{name})],{category}))
  assert.equal(decoded.items[0].fields[0].value,value)
  assert.throws(()=>validateExtraction(decoded,[source]),{code:'AI_EVIDENCE_MISMATCH'})
 }
})


test('excessive source fragments fail explicitly instead of returning a truncated registry',()=>{
 assert.throws(()=>buildSourceReferenceContract(extractionSchema,[{id:'input',page:1,text:'句。'.repeat(2049)}]),{code:'AI_SOURCE_LIMIT'})
})


test('uniqueness context cannot rescue a value that belongs only to a neighboring event',()=>{
 const source=referenceSource('重复。发热。重复。退热。'),c=buildSourceReferenceContract(extractionSchema,[source])
 assert.throws(()=>c.decode(referenceOutput([referenceField(c.sourceSegments[0],'发热')])),error=>error.code==='AI_SOURCE_REFERENCE_INVALID'&&error.details.sourceReference.reason==='value_outside_segment')
})
