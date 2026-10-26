import test from 'node:test'
import assert from 'node:assert/strict'
import {mergeItems} from './contract.mjs'

const observation=(id,sourceId)=>({id,category:'feeding',title:'饮食记录',timeText:null,fields:[{name:'food',value:'牛奶120毫升',sources:[{sourceId,page:1,quote:'牛奶120毫升'}]}]})
test('semantic front desk retains two separate inputs even when their text and unknown times match',()=>{
 const items=[observation('first','message-1'),observation('second','message-2')]
 assert.equal(mergeItems(items,{preserveOccurrences:true}).length,2)
 assert.equal(mergeItems(items).length,1)
})
test('repeated extraction of the same source remains idempotent',()=>{
 const items=[observation('first','message-1'),observation('same-source','message-1')]
 const merged=mergeItems(items,{preserveOccurrences:true})
 assert.equal(merged.length,1)
 assert.equal(merged[0].fields[0].sources.length,1)
 assert.deepEqual(merged[0].mergedIds,['same-source'])
})
