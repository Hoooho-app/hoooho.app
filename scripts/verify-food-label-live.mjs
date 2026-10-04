// Public packaging samples only; synthetic personal records, never production data.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import {FoodLabelService} from '../server/food-label/service.mjs'
const quiet={info(){},warn(){}}
const records=[{name:'牛奶',category:'food',currentStatus:'confirmed'},{name:'鸡蛋',category:'food',currentStatus:'suspected'}]
const service=new FoodLabelService({logger:quiet,members:{get:async()=>({})},readRecords:async()=>records})
for(const [name,filename,mime] of [['english','english-oreo.jpg','jpeg'],['chinese','chinese-label-crop.png','png']]){
  const buffer=await fs.readFile(`.codex-tmp/food-label-evidence/${filename}`)
  try{
    const result=await service.analyze('synthetic-food-live',{taskId:`food-live-${name}-${Date.now()}`,memberId:'synthetic',photos:[{dataUrl:`data:image/${mime};base64,${buffer.toString('base64')}`}]})
    assert.ok(result.ingredients.length>=16,'full label must retain 16+ entries')
    if(name==='chinese')assert.ok(result.conflictCount>0,'milk source must remain red')
    console.log(JSON.stringify({sample:name,rows:result.ingredients.length,knownRows:result.conflictCount,complete:result.complete,tone:result.tone,diagnostics:result.diagnostics,originals:result.ingredients.map(r=>r.original)}))
  }catch(error){console.log(JSON.stringify({sample:name,success:false,code:error.code??'ASSERTION',message:error.code?undefined:error.message}));process.exitCode=1}
}
