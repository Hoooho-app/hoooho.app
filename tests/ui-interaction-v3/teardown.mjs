import assert from 'node:assert/strict'
import {readFile,writeFile,unlink} from 'node:fs/promises'
import {request} from '@playwright/test'
export default async function teardown(config){
 const file=new URL('../../.codex-tmp/v3-browser-session.json',import.meta.url)
 try{
  const session=JSON.parse(await readFile(file,'utf8'))
  const api=await request.newContext({baseURL:config.projects[0].use.baseURL,storageState:session.storageState})
  try{const ended=await api.post('/api/auth/logout',{headers:{Authorization:`Bearer ${session.token}`},data:{}});assert(ended.ok(),'LOCAL_SYNTHETIC_LOGOUT_FAILED')}
  finally{await api.dispose();await unlink(file)}
 }catch(error){if(error.code!=='ENOENT')throw error}
 finally{await writeFile(new URL('./.shutdown',import.meta.url),'stop')}
}
