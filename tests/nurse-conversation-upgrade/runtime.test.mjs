import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {captureRuntime,runtimeSources} from './runtime.mjs'

async function syntheticRuntime(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'nurse-runtime-fingerprint-'))
 t.after(()=>rm(root,{recursive:true,force:true}))
 for(const file of runtimeSources){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),`synthetic source: ${file}\n`)}
 return root
}
test('all runtime boundaries are hashed from their exact bytes, including action, safety and context helpers',async t=>{
 const root=await syntheticRuntime(t),first=await captureRuntime(root)
 assert.equal(first.baseCommit,null);assert.equal(Object.keys(first.sources).length,13)
 for(const file of runtimeSources)assert.equal(first.sources[file],createHash('sha256').update(`synthetic source: ${file}\n`).digest('hex'))
 const changed='server/ai/business/front-desk-answer-context.mjs'
 await writeFile(path.join(root,changed),'synthetic revised answer binding\n')
 const second=await captureRuntime(root)
 assert.notEqual(second.sources[changed],first.sources[changed])
 for(const file of runtimeSources.filter(file=>file!==changed))assert.equal(second.sources[file],first.sources[file])
})
test('a missing required helper fails with its exact source path rather than silently omitting its fingerprint',async t=>{
 const root=await syntheticRuntime(t),file='server/ai/business/front-desk-source-context.mjs'
 await rm(path.join(root,file))
 await assert.rejects(()=>captureRuntime(root),error=>error.code==='RUNTIME_SOURCE_MISSING'&&error.sourcePath===file&&error.message.includes(file))
})
