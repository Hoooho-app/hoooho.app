import {readFile,writeFile,unlink} from 'node:fs/promises'
import {request} from '@playwright/test'
export default async function teardown(config){
 const file=new URL('../../.codex-tmp/rollback-browser-session.json',import.meta.url)
 try{
  const session=JSON.parse(await readFile(file,'utf8')),api=await request.newContext({baseURL:config.projects[0].use.baseURL,storageState:session.storageState})
  try{const response=await api.post('/api/auth/logout',{headers:{Authorization:`Bearer ${session.token}`},data:{}});if(!response.ok())throw Error('LOCAL_SYNTHETIC_LOGOUT_FAILED')}
  finally{await api.dispose();await unlink(file)}
 }catch(error){if(error.code!=='ENOENT')throw error}
 finally{await writeFile(new URL('./.shutdown',import.meta.url),'stop')}
}
