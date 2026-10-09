import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
process.chdir(path.resolve(import.meta.dirname,'../..'))
const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-help-e2e-'))
await writeFile(path.join(dataDirectory,'.cleanup-test-data-2026-08-09-v1'),'{}')
await writeFile(path.join(dataDirectory,'users.json'),JSON.stringify({users:[{id:'help-test',email:'help@hoooho.test',createdAt:new Date().toISOString()}]}))
process.env.PORT='4683'
process.env.HOST='127.0.0.1'
process.env.NODE_ENV='development'
process.env.DATA_DIRECTORY=dataDirectory
process.env.AUTH_TOKEN_SECRET='help-e2e-local-only-secret'
process.env.AI_PROVIDER='local'
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>void rm(dataDirectory,{recursive:true,force:true}).finally(()=>process.exit()))
await import('../../server/app.mjs')
