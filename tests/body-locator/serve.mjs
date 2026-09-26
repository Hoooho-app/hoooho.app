import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
process.chdir(path.resolve(import.meta.dirname,'../..'))
const marker=path.resolve('.codex-tmp/body-locator-shutdown')
await mkdir(path.dirname(marker),{recursive:true});await rm(marker,{force:true})
setInterval(()=>void access(marker).then(()=>process.exit()).catch(()=>undefined),200)
const dir=await mkdtemp(path.join(os.tmpdir(),'hoooho-body-locator-'))
const now=new Date().toISOString(), accountId='body-locator-test-account'
await writeFile(path.join(dir,'.cleanup-test-data-2026-08-09-v1'),'{}')
await writeFile(path.join(dir,'users.json'),JSON.stringify({users:[{id:accountId,email:'body-locator@hoooho.test',createdAt:now}]}))
await writeFile(path.join(dir,'family-members.json'),JSON.stringify({members:['iphone-se','mobile-390','mobile-430','desktop'].flatMap(project=>[['body-girl','女孩验收','female'],['body-boy','男孩验收','male'],['body-unknown','待补全档案',null]].map(([id,name,gender])=>({id:`${id}-${project}`,name,gender,accountId,relationship:'child',birthday:'2023-01-01',avatar:null,isSelf:false,createdAt:now,updatedAt:now})))}))
process.env.PORT='4197';process.env.HOST='127.0.0.1';process.env.NODE_ENV='development';process.env.DATA_DIRECTORY=dir
process.env.AUTH_TOKEN_SECRET='body-locator-local-test-only'
await import('../../server/app.mjs')
