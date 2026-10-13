import test from 'node:test'
import assert from 'node:assert/strict'
import {JournalIndexService} from './journal-index-service.mjs'

test('journal index reads each repository once and isolates account and member',async()=>{
 const calls={events:0,records:0,attachments:0};const owner='a'
 const service=new JournalIndexService({events:{assertMemberOwnership:async(account,member)=>{assert.equal(account,'a');if(member!=='child')throw Error('unowned')},repository:{findByAccountId:async()=>{calls.events++;return [{id:'event',accountId:'a',memberId:'child'},{id:'sibling',accountId:'a',memberId:'other'}]}}},recordRepository:{findByAccountId:async()=>{calls.records++;return [{id:'record',eventId:'event',accountId:owner,type:'note',content:'喂奶，后来红屁股',occurredAt:'2026-10-01T00:00:00Z',journal:{categories:['diet'],timePrecision:'unknown'}},{id:'sibling-record',eventId:'sibling',accountId:'a',content:'excluded'}]}},attachmentRepository:{findIndexByAccountId:async()=>{calls.attachments++;return [{id:'file',accountId:'a',eventId:'event',recordId:'record'},{id:'sibling-file',accountId:'a',eventId:'sibling'}]}}})
 const result=await service.list('a','child');assert.equal(result.events.length,1);assert.equal(result.records.length,1);assert.equal(result.attachments.length,1);assert.deepEqual(calls,{events:1,records:1,attachments:1})
 await assert.rejects(()=>service.list('a','someone-elses-child'));assert.deepEqual(calls,{events:1,records:1,attachments:1})
})

test('lone legacy original restores symptom visibility, while multi-occurrence source text never relabels its sibling',async()=>{
 const original='今天喝了配方奶，后来出现红屁股。'
 const event={id:'event',accountId:'a',memberId:'child'}
 const row={id:'record',accountId:'a',eventId:'event',type:'note',content:'食物：配方奶',sourceText:original,occurredAt:'2026-10-01T00:00:00Z',journal:{categories:['diet'],timePrecision:'unknown'}}
 let rows=[row]
 const service=new JournalIndexService({events:{assertMemberOwnership:async()=>{},repository:{findByAccountId:async()=>[event]}},recordRepository:{findByAccountId:async()=>rows},attachmentRepository:{findIndexByAccountId:async()=>[]}})
 const lone=await service.list('a','child');assert.deepEqual(lone.records[0].journal.categories,['diet','symptom']);assert.equal(lone.records[0].content,row.content)
 rows=[row,{...row,id:'sibling',content:'睡眠：午睡',journal:{categories:['sleep'],timePrecision:'unknown'}}]
 const multiple=await service.list('a','child');assert.deepEqual(multiple.records[0].journal.categories,['diet']);assert.deepEqual(multiple.records[1].journal.categories,['sleep'])
})
