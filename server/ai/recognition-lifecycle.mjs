import path from 'node:path'
import {existsSync} from 'node:fs'
import {unlink} from 'node:fs/promises'
import {DatabaseSync} from 'node:sqlite'
import {withStorageLock} from '../auth/storage/transaction.mjs'
const instances=new Map()
export function registerRecognitionInstance(directory,service){const key=path.resolve(directory),set=instances.get(key)??new Set();set.add(service);instances.set(key,set);return()=>{set.delete(service);if(!set.size)instances.delete(key)}}
// Called by the existing member/account lifecycle. No broad TTL is applied to
// conversations, originals, transcripts or saved record attachments.
export async function recognitionOwnerLifecycle(directory,accountId,{memberId,mergeInto}={}){
  if(!directory)return
  const dbPath=path.join(directory,'recognition-jobs.sqlite');if(!existsSync(dbPath))return
  await withStorageLock(async()=>{
    for(const service of instances.get(path.resolve(directory))??[]){for(const active of service.active.values()){const j=service.raw(active.id);if(j?.accountId===accountId&&(!memberId||j.memberId===memberId))active.controller.abort()}}
    const db=new DatabaseSync(dbPath),files=[]
    try{
      db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE')
      for(const table of ['jobs','assets']){
        const rows=db.prepare(`SELECT id,document FROM ${table} WHERE account_id=?`).all(accountId)
        for(const row of rows){const item=JSON.parse(row.document);if(memberId&&item.memberId!==memberId)continue
          if(mergeInto){item.accountId=mergeInto;if(table==='jobs'&&['running','publishing'].includes(item.state)){item.state='paused';item.stage='paused';item.cancelEpoch++;item.owner=null;item.leaseUntil=0}db.prepare(`UPDATE ${table} SET account_id=?,document=? WHERE id=?`).run(mergeInto,JSON.stringify(item),item.id)}
          else {if(table==='jobs'){db.prepare('DELETE FROM events WHERE job_id=?').run(item.id);db.prepare('DELETE FROM attempts WHERE job_id=?').run(item.id);db.prepare('DELETE FROM outbox WHERE job_id=?').run(item.id)}else files.push(item.id);db.prepare(`DELETE FROM ${table} WHERE id=?`).run(item.id)}
        }
      }
      db.exec('COMMIT')
    }catch(error){db.exec('ROLLBACK');throw error}finally{db.close()}
    await Promise.all(files.map(id=>unlink(path.join(directory,'recognition-originals',path.basename(id))).catch(error=>{if(error.code!=='ENOENT')throw error})))
  })
}
