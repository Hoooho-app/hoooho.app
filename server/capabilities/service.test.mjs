import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {capabilityInventory,publicCapabilityProfile,recordingMethods,retrieveRecordingMethods,readCapabilitySource,searchCapabilityLibrary,capabilityVersion} from './library.mjs'
import {CapabilityService,evaluateRecordingMethods} from './service.mjs'

test('inventory preserves all targets and only counts verified licensed selections',()=>{
 const i=capabilityInventory(),p=publicCapabilityProfile()
 assert.equal(i.targets.length,72)
 assert.equal(i.targets.filter(t=>t.id.startsWith('pediatric-')).length,30)
 assert.equal(new Set(i.targets.map(t=>t.id)).size,72)
 assert.equal(p.metrics.books,3)
 assert.equal(p.metrics.sourceSelections,19)
 assert.equal(p.metrics.recordingMethods,12)
 assert.ok(i.materials.some(s=>s.status==='reference_only'))
 assert.ok(i.importFailures.length>0)
 assert.ok(i.targets.every(t=>t.modelValidation==='not_verified'&&t.clinicalValidation==='not_verified'))
 for(const source of p.sources){assert.match(source.license,/CC/);assert.equal(readCapabilitySource(source.id).integrity,'verified')}
 assert.equal(Object.hasOwn(p,'reports'),false)
})
test('retrieval carries traceable methods separately from patient fact identifiers',()=>{
 for(const method of recordingMethods){const s=readCapabilitySource(method.sourceId);assert.ok(s.paragraphs.some(p=>p.text.includes(method.quote)))}
 const retrieved=retrieveRecordingMethods('妈妈没有咳嗽，孩子昨天咳嗽，没测体温；记录摘要',{limit:6,budget:3000})
 assert.ok(retrieved.length>0)
 assert.ok(retrieved.some(m=>m.id==='subject'))
 assert.ok(retrieved.every(m=>m.use==='recording_method_not_patient_fact'&&m.knowledgeVersion===capabilityVersion&&!m.evidenceId&&!m.factId))
 assert.ok(retrieved.reduce((n,m)=>n+JSON.stringify(m).length,0)<=3000)
 assert.deepEqual(retrieveRecordingMethods('咳嗽',{budget:1}),[])
 assert.deepEqual(searchCapabilityLibrary(''),[])
 assert.throws(()=>readCapabilitySource('../../users.json'),{status:404})
 assert.equal(evaluateRecordingMethods().passed,13)
})
test('search never saves queries; reports persist atomically and stale versions stay stale',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'capabilities-'))
 t.after(()=>rm(dir,{recursive:true,force:true}))
 const s=new CapabilityService({dataDirectory:dir})
 const found=s.search('合成测试孩子没测体温')
 assert.equal(found.queryStored,false)
 assert.throws(()=>s.search('x'.repeat(501)),{status:400})
 const [a,b]=await Promise.all([s.evaluate(),s.evaluate()])
 assert.equal(a.id,b.id)
 const reload=new CapabilityService({dataDirectory:dir})
 let i=await reload.overview();assert.equal(i.reports.length,1);assert.equal(i.reports[0].current,true)
 assert.equal(i.reports[0].modelSemantics,'not_tested')
 await reload.store.update(data=>({...data,reports:[{...a,id:'old',version:'old'},...data.reports]}))
 i=await reload.overview();assert.equal(i.reports[0].current,false)
 assert.deepEqual(await readdir(dir),['recording-capability-evaluations.json'])
 assert.doesNotMatch(await readFile(path.join(dir,'recording-capability-evaluations.json'),'utf8'),/合成测试孩子没测体温/)
})
