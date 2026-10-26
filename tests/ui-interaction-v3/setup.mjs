import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {request} from '@playwright/test'

// One actual local account for the serial projects. Do not disable the real
// registration limiter or fabricate tokens when Playwright restarts a worker.
export default async function setup(config){
 const baseURL=config.projects[0].use.baseURL
 const api=await request.newContext({baseURL})
 try{
  const response=await api.post('/api/auth/register',{data:{nickname:`V3${crypto.randomUUID().replaceAll('-','').slice(0,16)}`,password:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()}})
  assert(response.ok(),`LOCAL_SYNTHETIC_REGISTRATION_${response.status()}`)
  const session=await response.json(),storageState=await api.storageState()
  assert(session.token&&session.user?.id&&storageState.cookies.length,'LOCAL_AUTH_RECEIPT_MISSING')
  await mkdir(new URL('../../.codex-tmp/',import.meta.url),{recursive:true})
  await writeFile(new URL('../../.codex-tmp/v3-browser-session.json',import.meta.url),JSON.stringify({...session,storageState}))
 }finally{await api.dispose()}
}
