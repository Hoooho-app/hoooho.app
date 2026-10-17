import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import {QuickRecordPhotoService} from '../events/quick-record-photo-service.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {reuseRecognitionPhoto} from './recognition-asset-reuse.mjs'

test('reuse retains exact original bytes and enforces account/member/draft ownership before upload',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-photo-reuse-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const members=new FamilyMemberRepository(directory),one=await members.create({accountId:'owner',name:'虚构甲',relationship:'child'}),two=await members.create({accountId:'owner',name:'虚构乙',relationship:'child'}),photos=new QuickRecordPhotoService({dataDirectory:directory})
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#abc'}}).png().toBuffer()
  const saved=await photos.upload('owner','draft-123456',{memberId:one.id,name:'原图.png',mimeType:'image/png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')})
  let calls=0;const jobs={scope:(a,m)=>photos.assertMemberOwnership(a,m),upload:async(a,m,input)=>{calls++;assert.deepEqual(input.buffer,bytes);assert.equal(a,'owner');assert.equal(m,one.id);return {id:'asset'}}}
  const ref={quickRecordDraftId:'draft-123456',photoId:saved.id}
  assert.deepEqual(await reuseRecognitionPhoto(jobs,photos,'owner',one.id,ref),{id:'asset'})
  await assert.rejects(()=>reuseRecognitionPhoto(jobs,photos,'foreign',one.id,ref),{status:404})
  await assert.rejects(()=>reuseRecognitionPhoto(jobs,photos,'owner',two.id,ref),{status:404})
  await assert.rejects(()=>reuseRecognitionPhoto(jobs,photos,'owner',one.id,{...ref,path:'private'}),{code:'RECOGNITION_ASSET_INVALID'})
  await photos.consume('owner','draft-123456',[saved])
  await assert.rejects(()=>reuseRecognitionPhoto(jobs,photos,'owner',one.id,ref),{status:404})
  assert.equal(calls,1)
})
