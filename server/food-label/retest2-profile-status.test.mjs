import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {AuthService} from '../auth/auth-service.mjs'
import {ProfileSectionStore} from '../health-profile/profile-section-store.mjs'
import {ChildProfileListService} from '../health-profile/child-profile-list-service.mjs'
import {CareHandoffService} from '../care-handoff/care-handoff-service.mjs'
import {createFoodLabelService} from './api.mjs'
const image=await sharp({create:{width:80,height:60,channels:3,background:'#fff'}}).png().toBuffer()
const model={structured:async request=>{
 if(request.task==='food-label-read')return {value:{text:'Ingredients: Milk.',status:'readable'},diagnostics:{success:true}}
 if(request.task==='food-label-coverage')return {value:{text:'完整范围',status:'readable'},diagnostics:{success:true}}
 const input=JSON.parse(request.input)
 return {value:Object.fromEntries(Object.entries(input).map(([key,list])=>[key,list.map(original=>({original,chinese:original==='Milk'?'牛奶':original,english:original,sourceLanguage:'en',reliable:true,sourceUnknown:false}))])),diagnostics:{success:true}}
}}
async function fixture(t,currentStatus){
 const directory=await mkdtemp(path.join(os.tmpdir(),'retest2-food-status-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const auth=new AuthService({dataDirectory:directory,tokenSecret:'synthetic-retest2-food-secret',logger:()=>{}}),user=await auth.users.createGuest(),child=await auth.members.create({accountId:user.id,name:'虚构食品验收儿童',relationship:'child'}),sections=new ProfileSectionStore(directory)
 await sections.update(()=>({sections:[{accountId:user.id,memberId:child.id,sectionId:'allergy',records:[{id:'milk',name:'牛奶',category:'food',currentStatus}]},{accountId:user.id,memberId:child.id,sectionId:'dietary-card',records:[{version:1,memberId:child.id,items:[],avoidCrossContact:false}]}]}))
 const service=createFoodLabelService({dataDirectory:directory,tokenSecret:'synthetic-retest2-food-secret',model})
 return {directory,user,child,sections,service}
}
test('all supported confirmed aliases produce the same personal milk warning through the real factory',async t=>{
 for(const status of ['confirmed','已明确','已确诊','医生明确','医生确认']){
  const f=await fixture(t,status),result=await f.service.analyze(f.user.id,{taskId:'retest2-food-status',memberId:f.child.id,photos:[{dataUrl:'data:image/png;base64,'+image.toString('base64')}]})
  assert.equal(result.conflictCount,1,status);assert.equal(result.ingredients[0].status,'known',status);assert.notEqual(result.tone,'success')
  const profile=await new ChildProfileListService({dataDirectory:f.directory}).list(f.user.id,f.child.id,'allergy');assert.equal(profile.rows.length,1,status)
  const card=(await f.sections.read()).sections.find(s=>s.sectionId==='dietary-card').records[0];assert.equal(card.items[0].group,'avoid',status)
  const hand=await new CareHandoffService({dataDirectory:f.directory}).preview(f.user.id,f.child.id);assert.equal(hand.sections.find(s=>s.id==='restrictions').rows[0].source,'已确认的过敏史',status)
 }
})
test('uncertain or excluded legacy statuses are not promoted to confirmed personal conflicts',async t=>{
 for(const [status,expected] of [['疑似','possible'],['待排查','possible'],['已排除','common']]){
  const f=await fixture(t,status),result=await f.service.analyze(f.user.id,{taskId:'retest2-food-status',memberId:f.child.id,photos:[{dataUrl:'data:image/png;base64,'+image.toString('base64')}]})
  assert.equal(result.conflictCount,0,status);assert.equal(result.ingredients[0].status,expected,status);assert.notEqual(result.tone,'success')
 }
})
