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
test('all runtime boundaries are hashed from their exact bytes, including legacy compatibility and source-summary verification',async t=>{
 const root=await syntheticRuntime(t),first=await captureRuntime(root)
 assert.equal(first.baseCommit,null);assert.equal(Object.keys(first.sources).length,27)
 for(const file of runtimeSources)assert.equal(first.sources[file],createHash('sha256').update(`synthetic source: ${file}\n`).digest('hex'))
 const changed='server/ai/business/semantic-summary.mjs'
 await writeFile(path.join(root,changed),'synthetic revised semantic verification\n')
 const second=await captureRuntime(root)
 assert.notEqual(second.sources[changed],first.sources[changed])
 for(const file of runtimeSources.filter(file=>file!==changed))assert.equal(second.sources[file],first.sources[file])
})
test('a missing required helper fails with its exact source path rather than silently omitting its fingerprint',async t=>{
 const root=await syntheticRuntime(t)
 for(const file of ['server/ai/business/front-desk-source-context.mjs','server/ai/front-desk-legacy-semantic-record.mjs','server/ai/business/semantic-summary.mjs','server/ai/business/source-references.mjs','server/ai/business/front-desk-semantics.mjs']){
  await rm(path.join(root,file))
  await assert.rejects(()=>captureRuntime(root),error=>error.code==='RUNTIME_SOURCE_MISSING'&&error.sourcePath===file&&error.message.includes(file))
  await writeFile(path.join(root,file),`synthetic source: ${file}\n`)
 }
})
