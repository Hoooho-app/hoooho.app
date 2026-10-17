import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {FoodLabelService,parseLabelText} from './service.mjs'
const image=await sharp({create:{width:80,height:50,channels:3,background:'#fff'}}).png().toBuffer()
const photos=[{dataUrl:'data:image/png;base64,'+image.toString('base64')}]
const records=[{id:'milk',name:'牛奶',category:'food',currentStatus:'confirmed'}]
async function analyze(text,coverage='完整范围'){
  const model={structured:async request=>{
    if(request.task==='food-label-read')return {value:{text,status:'readable'},diagnostics:{success:true}}
    if(request.task==='food-label-coverage')return {value:{text:coverage,status:coverage==='完整范围'?'readable':'uncertain'},diagnostics:{success:true}}
    const input=JSON.parse(request.input)
    const translate=original=>original.replace(/milk/gi,'牛奶').replace(/water/gi,'水')
    return {value:Object.fromEntries(Object.entries(input).map(([key,rows])=>[key,rows.map(original=>({original,chinese:translate(original),english:original,sourceLanguage:/[\u3400-\u9fff]/.test(original)?'zh':'en',reliable:true,sourceUnknown:false}))])),diagnostics:{success:true}}
  }}
  return new FoodLabelService({members:{get:async()=>{}},readRecords:async()=>records,model}).analyze('owner',{taskId:'packaging-regression',memberId:'child',photos})
}
test('correctly read milk survives adjacent sentence and printed-line packaging claims',async()=>{
  for(const text of ['Ingredients: Milk. Gluten-free.','Ingredients: Milk.\nGluten-free.','Ingredients: Milk. Certified gluten-free.','Ingredients: Milk. Gluten Free™.','Ingredients: Milk. Gluten-free product.','Ingredients: Milk. Certified gluten-free product®.','配料表：水、牛奶。不含麸质。','Ingredients: Water, Milk. Store in a cool dry place.','Ingredients: Milk. Sans gluten.','Ingredients: Milk. Sin gluten.','Ingredients: Milk. Glutenfrei.']){
    const r=await analyze(text)
    assert.equal(r.complete,true,text);assert.equal(r.conflictCount,1,text)
    assert.ok(r.ingredients.some(i=>i.status==='known'),text)
    assert.notEqual(r.tone,'success')
    assert.ok(r.ingredients.every(i=>!/(?:gluten[- ]free|不含麸质|Store in|sans gluten|sin gluten|glutenfrei)/i.test(i.original)),text)
  }
})
test('claim boundary does not alter qualified milk, parent composition, or packaging contact evidence',async()=>{
  for(const text of ['Ingredients: Lactose-free milk. Gluten-free.','Ingredients: Milk (lactose-free). Gluten-free.','Ingredients: Blend (Milk, Salt), Water. Gluten-free.']){
    const r=await analyze(text);assert.equal(r.conflictCount,1,text)
  }
  const contact=await analyze('Ingredients: Water. Milk-free. May contain milk.')
  assert.equal(contact.conflictCount,0)
  assert.equal(contact.advisory[0].status,'possible')
  const partial=await analyze('Ingredients: Milk. Gluten-free.','声明范围缺失')
  assert.equal(partial.complete,false);assert.equal(partial.conflictCount,1);assert.notEqual(partial.tone,'success')
})
test('sentence and claim markers leave chemical punctuation and real ingredient qualifiers intact',()=>{
  assert.equal(parseLabelText('Ingredients: Vitamin B12, Lactose-free milk.','readable').ingredients,'Vitamin B12, Lactose-free milk')
  assert.equal(parseLabelText('Ingredients: Milk (gluten-free), Water.','readable').ingredients,'Milk (gluten-free), Water')
  assert.equal(parseLabelText('Ingredients: Milk, Gluten-free.','readable').ingredients,'Milk, Gluten-free')
  assert.equal(parseLabelText('Ingredients: non-dairy creamer, gluten-free oats, Milk.','readable').ingredients,'non-dairy creamer, gluten-free oats, Milk')
  assert.equal(parseLabelText('Ingredients: Certified gluten-free oats, non-dairy creamer, Milk.','readable').ingredients,'Certified gluten-free oats, non-dairy creamer, Milk')
})
