import {randomUUID} from 'node:crypto'
import {readFile,writeFile,lstat,realpath,stat} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// Opt-in operator file contains only this harness's generated test credentials.
// It must stay in a private temporary directory and never enters a report.
export async function authenticateSyntheticAccount(api,file=process.env.HOOOHO_SYNTHETIC_ACCOUNT_FILE){
 let credentials,target
 if(file){
  const temporary=await realpath(os.tmpdir()),parent=await realpath(path.dirname(path.resolve(file)))
  if(!parent.startsWith(temporary+path.sep))throw new Error('Synthetic account file must be temporary')
  const directory=await stat(parent)
  if(!directory.isDirectory()||(directory.mode&0o077)!==0||typeof process.getuid==='function'&&directory.uid!==process.getuid())throw new Error('Synthetic account directory must be private')
  target=path.join(parent,path.basename(file))
  try{
   const existing=await lstat(target)
   if(!existing.isFile()||existing.isSymbolicLink()||(existing.mode&0o077)!==0||typeof process.getuid==='function'&&existing.uid!==process.getuid())throw new Error('Synthetic account file permissions invalid')
   credentials=JSON.parse(await readFile(target,'utf8'))
   if(credentials.marker!=='hoooho-semantic-acceptance-v1'||!/^Sem[a-f0-9]{16}$/.test(credentials.nickname??'')||!/^[-a-f0-9]{36}$/.test(credentials.password??'')||!/^[-a-f0-9]{36}$/.test(credentials.idempotencyKey??'')||typeof credentials.registered!=='boolean')throw new Error('Not a harness-owned synthetic account')
  }catch(error){if(error.code!=='ENOENT')throw error}
 }
 if(!credentials){
  credentials={marker:'hoooho-semantic-acceptance-v1',nickname:`Sem${randomUUID().replaceAll('-','').slice(0,16)}`,password:randomUUID(),idempotencyKey:randomUUID(),registered:false}
  if(file)await writeFile(target,JSON.stringify(credentials),{mode:0o600,flag:'wx'})
 }
 if(credentials.registered)return api('/api/auth/nickname/login','POST',{nickname:credentials.nickname,password:credentials.password},20000)
 const result=await api('/api/auth/register','POST',{nickname:credentials.nickname,password:credentials.password,idempotencyKey:credentials.idempotencyKey},20000)
 if(file)await writeFile(target,JSON.stringify({...credentials,registered:true}),{mode:0o600})
 return result
}
