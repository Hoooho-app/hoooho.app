// Complete proposed module: tests/dialogue/synthetic-acceptance-account.test.mjs
// No network requests and no real accounts. Credentials stay in private fixture
// files/in-memory mocks; assertions intentionally never print credential values.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,lstat,readdir,chmod,symlink,rm,chown} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {authenticateSyntheticAccount} from './synthetic-acceptance-account.mjs'

const syntheticCredentialFixture=registered=>({marker:'hoooho-semantic-acceptance-v1',nickname:'Sem0123456789abcdef',password:'11111111-1111-4111-8111-111111111111',idempotencyKey:'22222222-2222-4222-8222-222222222222',registered})
const syntheticAccountOptions={concurrency:false,skip:process.platform==='win32'}
async function syntheticAccountScope(run){
 const root=await mkdtemp(path.join(os.tmpdir(),'hoooho-account-test-')),scope=path.join(root,'scope'),allowed=path.join(scope,'private'),outside=path.join(root,'outside'),saved=process.env.TMPDIR
 await mkdir(scope,{mode:0o700});await mkdir(allowed,{mode:0o700});await mkdir(outside,{mode:0o700})
 process.env.TMPDIR=scope
 try{return await run({root,allowed,outside,file:path.join(allowed,'account.json')})}
 finally{if(saved===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=saved;await rm(root,{recursive:true,force:true})}
}
function syntheticAccountApi(){
 const calls=[],session={token:'synthetic-session-result',user:{id:'synthetic-account'}}
 return {calls,session,api:async(route,method,body,timeout)=>{calls.push({route,method,body,timeout});return session}}
}
const writeSyntheticCredentials=(file,registered=true)=>writeFile(file,JSON.stringify(syntheticCredentialFixture(registered)),{mode:0o600})

test('synthetic account first creation stores only harness credentials in a private 0600 file',syntheticAccountOptions,async()=>syntheticAccountScope(async({file,allowed})=>{
 const f=syntheticAccountApi(),result=await authenticateSyntheticAccount(f.api,file)
 assert.ok(result===f.session,'returns the API result without serializing it')
 assert.deepEqual(f.calls.map(c=>c.route),['/api/auth/register']);assert.equal(f.calls[0].method,'POST');assert.equal(f.calls[0].timeout,20000)
 const stat=await lstat(file),stored=JSON.parse(await readFile(file,'utf8'))
 assert.equal(stat.mode&0o777,0o600);assert.equal((await lstat(allowed)).mode&0o777,0o700)
 assert.deepEqual(Object.keys(stored).sort(),['idempotencyKey','marker','nickname','password','registered'])
 assert.equal(stored.registered,true);assert.ok(/^Sem[a-f0-9]{16}$/.test(stored.nickname),'generated nickname shape')
 assert.ok(/^[-a-f0-9]{36}$/.test(stored.password),'generated password shape');assert.ok(/^[-a-f0-9]{36}$/.test(stored.idempotencyKey),'generated idempotency key shape')
 assert.ok(f.calls[0].body.nickname===stored.nickname&&f.calls[0].body.password===stored.password&&f.calls[0].body.idempotencyKey===stored.idempotencyKey,'persisted values match this synthetic registration')
 assert.deepEqual(await readdir(allowed),['account.json'],'no session token or report file is written')
}))

test('synthetic account reuse performs login only and leaves the credential file unchanged',syntheticAccountOptions,async()=>syntheticAccountScope(async({file})=>{
 await writeSyntheticCredentials(file,true)
 const before=await readFile(file,'utf8'),f=syntheticAccountApi()
 await authenticateSyntheticAccount(f.api,file);await authenticateSyntheticAccount(f.api,file)
 assert.deepEqual(f.calls.map(c=>c.route),['/api/auth/nickname/login','/api/auth/nickname/login'])
 assert.ok(f.calls.every(c=>c.method==='POST'&&c.timeout===20000),'both calls use the bounded login endpoint')
 assert.ok(f.calls.every(c=>Object.keys(c.body).sort().join(',')==='nickname,password'),'login never re-registers or sends the registration key')
 assert.ok(before===await readFile(file,'utf8'),'login must not rewrite private credentials')
}))

test('synthetic account interrupted registration reuses its exact pending idempotency identity and subsequently logs in',syntheticAccountOptions,async()=>syntheticAccountScope(async({file})=>{
 const calls=[];let fail=true
 const api=async(route,method,body,timeout)=>{calls.push({route,method,body,timeout});if(fail){fail=false;throw new Error('synthetic transient registration failure')}return {token:'synthetic-session-result'}}
 await assert.rejects(()=>authenticateSyntheticAccount(api,file))
 const pending=JSON.parse(await readFile(file,'utf8'));assert.equal(pending.registered,false)
 await authenticateSyntheticAccount(api,file);await authenticateSyntheticAccount(api,file)
 assert.deepEqual(calls.map(c=>c.route),['/api/auth/register','/api/auth/register','/api/auth/nickname/login'])
 assert.ok(calls[0].body.nickname===calls[1].body.nickname&&calls[0].body.password===calls[1].body.password&&calls[0].body.idempotencyKey===calls[1].body.idempotencyKey,'retry must reuse pending credentials and idempotency key')
 assert.equal(JSON.parse(await readFile(file,'utf8')).registered,true)
}))

test('synthetic account rejects group-readable or world-readable credential files before any API call',syntheticAccountOptions,async()=>syntheticAccountScope(async({file})=>{
 await writeSyntheticCredentials(file)
 for(const mode of [0o640,0o644,0o660]){
  await chmod(file,mode);const f=syntheticAccountApi()
  await assert.rejects(()=>authenticateSyntheticAccount(f.api,file));assert.equal(f.calls.length,0)
 }
}))

test('synthetic account rejects a public 0755 parent directory, even when the file itself is 0600',syntheticAccountOptions,async()=>syntheticAccountScope(async({allowed,file})=>{
 await writeSyntheticCredentials(file);await chmod(allowed,0o755)
 const f=syntheticAccountApi();await assert.rejects(()=>authenticateSyntheticAccount(f.api,file));assert.equal(f.calls.length,0)
}))

test('synthetic account rejects out-of-scope paths and does not modify the file',syntheticAccountOptions,async()=>syntheticAccountScope(async({outside})=>{
 const file=path.join(outside,'outside.json');await writeSyntheticCredentials(file)
 const before=await readFile(file,'utf8'),f=syntheticAccountApi()
 await assert.rejects(()=>authenticateSyntheticAccount(f.api,file));assert.equal(f.calls.length,0)
 assert.ok(before===await readFile(file,'utf8'),'out-of-scope file is unchanged')
}))

test('synthetic account rejects a direct credential symlink and a parent symlink escaping the canonical temporary scope',syntheticAccountOptions,async()=>syntheticAccountScope(async({allowed,outside})=>{
 const target=path.join(outside,'account.json');await writeSyntheticCredentials(target)
 const direct=path.join(allowed,'direct.json'),parent=path.join(allowed,'escape')
 await symlink(target,direct);await symlink(outside,parent,'dir')
 for(const file of [direct,path.join(parent,'account.json')]){
  const f=syntheticAccountApi();await assert.rejects(()=>authenticateSyntheticAccount(f.api,file));assert.equal(f.calls.length,0)
 }
}))

test('synthetic account permits a parent alias resolving to a private directory inside canonical temporary scope',syntheticAccountOptions,async()=>syntheticAccountScope(async({allowed})=>{
 const canonical=path.join(allowed,'private'),alias=path.join(allowed,'alias')
 await mkdir(canonical,{mode:0o700});await symlink(canonical,alias,'dir')
 const canonicalFile=path.join(canonical,'account.json');await writeSyntheticCredentials(canonicalFile)
 const before=await readFile(canonicalFile,'utf8'),f=syntheticAccountApi()
 await authenticateSyntheticAccount(f.api,path.join(alias,'account.json'))
 assert.deepEqual(f.calls.map(c=>c.route),['/api/auth/nickname/login'])
 assert.ok(before===await readFile(canonicalFile,'utf8'),'canonical file remains unchanged')
}))

test('synthetic account rejects non-harness content and directory targets without API calls or overwrites',syntheticAccountOptions,async()=>syntheticAccountScope(async({file,allowed})=>{
 const source=JSON.stringify({...syntheticCredentialFixture(true),marker:'not-this-harness'})
 await writeFile(file,source,{mode:0o600})
 const f=syntheticAccountApi();await assert.rejects(()=>authenticateSyntheticAccount(f.api,file));assert.equal(f.calls.length,0)
 assert.ok(source===await readFile(file,'utf8'),'foreign contents are preserved')
 await assert.rejects(()=>authenticateSyntheticAccount(f.api,allowed));assert.equal(f.calls.length,0)
}))

test('synthetic account helper emits no credentials or API session results to console',syntheticAccountOptions,async t=>syntheticAccountScope(async({file})=>{
 const output=[]
 for(const method of ['log','info','warn','error','debug'])t.mock.method(console,method,(...args)=>output.push(args))
 const f=syntheticAccountApi();await authenticateSyntheticAccount(f.api,file);await authenticateSyntheticAccount(f.api,file)
 await chmod(file,0o644);await assert.rejects(()=>authenticateSyntheticAccount(f.api,file))
 assert.equal(output.length,0,'credential/session helper must remain silent on success and rejection')
}))

test('synthetic account rejects a differently owned file or parent',{
 ...syntheticAccountOptions,skip:process.platform==='win32'||typeof process.getuid!=='function'||process.getuid()!==0,
},async t=>syntheticAccountScope(async({file,allowed})=>{
 await writeSyntheticCredentials(file)
 const f=syntheticAccountApi(),otherUid=process.getuid()+1,gid=(await lstat(file)).gid
 try{await chown(file,otherUid,gid)}catch(error){if(['EPERM','EACCES','EINVAL','ENOSYS','ENOTSUP'].includes(error.code)){t.skip('fixture filesystem cannot change file ownership');return}throw error}
 await assert.rejects(()=>authenticateSyntheticAccount(f.api,file));assert.equal(f.calls.length,0)
 await chown(file,process.getuid(),gid);await chown(allowed,otherUid,gid)
 await assert.rejects(()=>authenticateSyntheticAccount(f.api,file));assert.equal(f.calls.length,0)
}))
