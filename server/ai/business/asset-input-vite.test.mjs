import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {createServer} from 'node:http'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {eventsApiPlugin} from '../../events/vite-events-plugin.mjs'

test('Vite handles the same asset-based defer checkpoint as production without invoking the model',async t=>{
  const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-case-asset-vite-'))
  const member=await new FamilyMemberRepository(dataDirectory).create({accountId:'synthetic',name:'合成成员',relationship:'child'})
  let middleware,modelCalls=0
  const server=createServer((request,response)=>{void middleware(request,response,()=>{response.statusCode=404;response.end()})})
  const plugin=eventsApiPlugin({dataDirectory,tokens:{verify:()=>({sub:'synthetic'})},model:{structured:async()=>{modelCalls++;throw new Error('defer must not call model')}}})
  plugin.configureServer({httpServer:server,middlewares:{use:value=>{middleware=value}},config:{logger:{error(){}}}})
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dataDirectory,{recursive:true,force:true})})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base=`http://127.0.0.1:${server.address().port}`,buffer=await sharp({create:{width:8,height:8,channels:3,background:'#abc'}}).png().toBuffer()
  const upload=await fetch(`${base}/api/members/${member.id}/recognition-assets?name=original.png`,{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'image/png'},body:buffer})
  assert.equal(upload.status,201);const asset=await upload.json()
  const prepared=await fetch(`${base}/api/members/${member.id}/ai-drafts`,{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({assetIds:[asset.id],text:'没有呕吐',task:'record',sourceIdentity:'pending',deferRecognition:true})})
  assert.equal(prepared.status,200);const draft=await prepared.json();assert.equal(draft.state,'changed');assert.equal(draft.pages.length,1);assert.equal(modelCalls,0)
  const invalid=await fetch(`${base}/api/members/${member.id}/ai-drafts`,{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({assetIds:[asset.id],files:[],text:'不能混用',deferRecognition:true})})
  assert.equal(invalid.status,422);assert.equal((await invalid.json()).error.code,'AI_DRAFT_ASSET_INVALID')
})
