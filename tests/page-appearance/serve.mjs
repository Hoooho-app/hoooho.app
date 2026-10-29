import { mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-page-appearance-'))
const now=new Date().toISOString()
await writeFile(path.join(directory,'users.json'),JSON.stringify({users:[{id:'design-quality-account',email:'design@hoooho.test',createdAt:now,updatedAt:now}]}))
await writeFile(path.join(directory,'.cleanup-test-data-2026-08-09-v1'),'{}')
await writeFile(path.join(directory,'family-members.json'),JSON.stringify({members:[{id:'design-quality-member',accountId:'design-quality-account',name:'合成宝宝',relationship:'child',gender:'female',birthday:'2023-05-12',avatar:null,isSelf:false,createdAt:now,updatedAt:now}]}))
process.env.PORT='4397'
process.env.HOST='127.0.0.1'
process.env.NODE_ENV='development'
process.env.DATA_DIRECTORY=directory
process.env.AUTH_TOKEN_SECRET='design-quality-e2e-secret'
await import('../../server/app.mjs')
