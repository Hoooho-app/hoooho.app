import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {validateVisitMaterials} from './visit-materials-metadata.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {CaseContinuityService} from './case-continuity-service.mjs'
const materials=()=>({source:'hospital',status:'reviewed',title:'合成资料',documents:[{id:'doc',name:'原话',kind:'text',status:'ready',originalText:'原始资料完整保留'}],blocks:[{id:'block',title:'要点',text:'第一段',quote:'原始资料',documentId:'doc',page:1}]})
test('paragraph identity is unique after trimming and NFKC normalization',()=>{
 for(const id of ['block',' block ','ｂｌｏｃｋ']){
  const m=materials();m.blocks.push({...m.blocks[0],id,text:'另一段'})
  assert.throws(()=>validateVisitMaterials(m),{status:400,code:'INVALID_VISIT_MATERIALS'})
 }
 const m=materials();m.blocks.push({...m.blocks[0],id:'other',text:'另一段'})
 assert.equal(validateVisitMaterials(m).blocks.length,2)
 m.status='originals_only';m.blocks.push({...m.blocks[0]})
 const original=validateVisitMaterials(m);assert.deepEqual(original.blocks,[]);assert.equal(original.documents[0].originalText,'原始资料完整保留')
})
test('rejected duplicate paragraph capture preserves the already saved original record',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'material-identity-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const members=new FamilyMemberRepository(directory),child=await members.create({accountId:'owner',name:'合成资料儿童',relationship:'child'}),service=new CaseContinuityService({dataDirectory:directory})
 const capture=(requestId,m)=>service.capture('owner',child.id,{requestId,title:m.title,text:'合成资料',timeUnknown:true,identity:'medical_consultation',journal:{categories:['visit'],visit:{visitType:'outpatient',materials:m}},files:[]})
 const first=await capture('original',materials()),before=await service.records.getOwnedRecord('owner',first.recordId),bad=materials();bad.blocks.push({...bad.blocks[0],text:'不应覆盖原段落'})
 await assert.rejects(()=>capture('duplicate',bad),{status:400,code:'INVALID_VISIT_MATERIALS'})
 assert.deepEqual(await service.records.getOwnedRecord('owner',first.recordId),before)
 assert.equal((await service.records.list('owner',first.eventId)).length,1)
})
