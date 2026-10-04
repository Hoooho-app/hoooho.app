// Explicit, finite live checks using public packaging only, no personal data.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {FoodLabelService} from '../server/food-label/service.mjs'
if(process.env.RUN_FOOD_LABEL_ACCEPTANCE!=='1')throw new Error('Explicit acceptance opt-in required')
const service=new FoodLabelService({logger:{info(){},warn(){}},members:{get:async()=>({})},readRecords:async()=>[]})
const original=service.model.structured.bind(service.model)
let calls=0,successes=0;const errors=[]
service.model.structured=async options=>{calls++;try{const value=await original(options);successes++;return value}catch(error){errors.push(error.code??'UNKNOWN');throw error}}
for(const [sample,file] of [['blurred','blurred-label.jpg'],['front-only','english-nutella.jpg']]){
  const bytes=await readFile(`.codex-tmp/food-label-evidence/${file}`)
  try{
    const result=await service.analyze('synthetic-negative-live',{taskId:`food-negative-${sample}-${Date.now()}`,memberId:'synthetic',photos:[{dataUrl:`data:image/jpeg;base64,${bytes.toString('base64')}`}]})
    assert.equal(result.complete,false);assert.notEqual(result.tone,'success');assert.ok(result.ingredients.every(row=>row.status==='pending'))
    console.log(JSON.stringify({sample,status:'PASS',rows:result.ingredients.length,complete:result.complete,diagnostics:result.diagnostics}))
  }catch(error){
    assert.equal(error.code,'FOOD_NO_INGREDIENTS',`Unexpected ${sample} failure: ${error.code}`)
    console.log(JSON.stringify({sample,status:'PASS',rejected:error.code}))
  }
}
console.log(JSON.stringify({calls,successes,errors}))
