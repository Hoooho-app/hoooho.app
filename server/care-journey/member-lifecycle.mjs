import path from 'node:path'
import {JsonStore} from '../auth/storage/json-store.mjs'
import {accountTransaction} from '../auth/storage/transaction.mjs'

export async function careMemberLifecycle(dataDirectory,accountId,memberId){
  return accountTransaction(dataDirectory,async()=>{
    const observations = new JsonStore(path.join(dataDirectory,'food-observations.json'),{preferences:[],observations:[]})
    await observations.update(data=>({...data,
      preferences:data.preferences.filter(row=>row.accountId!==accountId||row.memberId!==memberId),
      observations:data.observations.filter(row=>row.accountId!==accountId||row.memberId!==memberId)
    }))
    const store=new JsonStore(path.join(dataDirectory,'care-journey.json'),{accounts:[]})
    await store.update(data=>({...data,accounts:data.accounts.map(account=>account.accountId!==accountId?account:{...account,
      snapshots:(account.snapshots??[]).filter(x=>x.memberId!==memberId),
      materials:(account.materials??[]).filter(x=>x.memberId!==memberId),
      reservations:(account.reservations??[]).filter(x=>x.memberId!==memberId&&x.result?.memberId!==memberId)
    })}))
  })
}
