import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {request} from '@playwright/test'
export default async function setup(config){
 const api=await request.newContext({baseURL:config.projects[0].use.baseURL})
 try{
  const response=await api.post('/api/auth/register',{data:{nickname:`回滚${crypto.randomUUID().replaceAll('-','').slice(0,14)}`,password:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()}})
  assert(response.ok(),`LOCAL_SYNTHETIC_REGISTRATION_${response.status()}`)
  const session=await response.json(),storageState=await api.storageState()
  assert(session.token&&session.user?.id&&storageState.cookies.length)
  await mkdir(new URL('../../.codex-tmp/',import.meta.url),{recursive:true})
  await writeFile(new URL('../../.codex-tmp/rollback-browser-session.json',import.meta.url),JSON.stringify({...session,storageState}))
 }finally{await api.dispose()}
}
