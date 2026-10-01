import test from 'node:test'
import assert from 'node:assert/strict'
import { documentPageWarnings } from './documents.mjs'
import { buildJournal } from './contract.mjs'
test('只凭原文页码提示缺页和重复；无页码不伪称整份齐全',()=>{
  assert.deepEqual(documentPageWarnings([{id:'a',page:1,text:'检查结果'}]),[])
  assert.match(documentPageWarnings([{id:'a',page:1,text:'第1页 共3页'},{id:'a',page:2,text:'第3页 共3页'}])[0],/第2页/)
  assert.match(documentPageWarnings([{id:'a',page:1,text:'Page 1 of 2'},{id:'b',page:1,text:'Page 1 of 2'}]).join(' '),/重复页码/)
  assert.deepEqual(documentPageWarnings([{id:'a',page:1,text:'第1页 共2页'},{id:'a',page:2,text:'第2页 共2页'}]),[])
})
test('只有食物与数量不补成正餐，未知保持真实类别与来源字段',()=>{
  const journal=buildJournal({category:'diet',time:{precision:'unknown'},fields:[{name:'food',value:'牛奶'},{name:'amount',value:'10'},{name:'unit',value:'mL'}]})
  assert.deepEqual(journal.categories,['diet']);assert.equal(journal.diet,undefined)
})
