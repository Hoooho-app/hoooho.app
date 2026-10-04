import test from 'node:test'
import assert from 'node:assert/strict'
import { checkLabel, flattenIngredients, splitDeclaredAllergens } from './rules.mjs'

test('printed line wrapping is not an ingredient separator',()=>{
  const rows=flattenIngredients('PALM AND/OR\nCANOLA OIL, HIGH FRUCTOSE\nCORN SYRUP, LEAVENING (BAKING SODA AND/OR CALCIUM\nPHOSPHATE), VANILLIN - AN\nARTIFICIAL FLAVOR')
  assert.deepEqual(rows.map(r=>r.original),['PALM AND/OR CANOLA OIL','HIGH FRUCTOSE CORN SYRUP','LEAVENING','BAKING SODA AND/OR CALCIUM PHOSPHATE','VANILLIN - AN ARTIFICIAL FLAVOR'])
})

test('isolated quantities attach to ingredients; arrows and ordinals never count',()=>{
  assert.deepEqual(flattenIngredients('01 大米, ≥60%, →, 02 牛奶, 12 g, 白砂糖, 3.').map(r=>r.original),['大米 ≥60%','牛奶 12 g','白砂糖'])
  assert.deepEqual(flattenIngredients('Rice (≥60%), Blend (Milk, 20%, Salt), Water').map(r=>r.original),['Rice (≥60%)','Blend','Milk 20%','Salt','Water'])
  assert.equal(checkLabel(label([row('Milk ≥20%')]),records).conflictCount,1)
  assert.deepEqual(flattenIngredients('①, ↓, ② Rice, Sugar').map(r=>r.original),['Rice','Sugar'])
  assert.deepEqual(flattenIngredients('Rice, %, g, ◆, Sugar').map(r=>r.original),['Rice','Sugar'])
})

test('percentage annotations do not swallow following compound ingredients',()=>{
  const rows=flattenIngredients('Chocolate (19%) [Sugar, Whey Powder (Milk), Emulsifier (Soya Lecithins)], Water')
  assert.deepEqual(rows.map(r=>r.original),['Chocolate (19%)','Sugar','Whey Powder','Milk','Emulsifier','Soya Lecithins','Water'])
})
test('abbreviation and processing annotations do not inflate ingredient counts',()=>{
  assert.deepEqual(flattenIngredients('Riboflavin (Vitamin B2), Cocoa (processed with alkali), 油脂(DHA)').map(r=>r.original),['Riboflavin (Vitamin B2)','Cocoa (processed with alkali)','油脂(DHA)'])
})
test('multi-allergen cross-contact sentences stay yellow and candidates never become diagnosed',()=>{
  const result=checkLabel(label([row('Egg','鸡蛋')],{advisory:[row('Made on equipment that processes milk, eggs and nuts.','生产设备也加工牛奶、鸡蛋和坚果')]}),[{name:'饼干',category:'food',currentStatus:'confirmed',ingredientRelations:[{name:'鸡蛋',relation:'candidate'}]},...records])
  assert.equal(result.advisory[0].status,'possible')
  assert.equal(result.ingredients[0].status,'possible')
})

const records = [{ name:'牛奶', category:'food', currentStatus:'confirmed' }, { name:'鸡蛋', category:'food', currentStatus:'investigating' }]
const row = (original, chinese=original, reliable=true) => ({ original, chinese, reliable, sourceUnknown:false })
const label = (ingredients, extra={}) => ({ ingredients, contains:[], advisory:[], complete:true, issues:[], ...extra })
test('confirmed derivatives stay red; suspected egg never becomes confirmed', () => {
  const result=checkLabel(label([row('Whey','乳清'),row('Egg','鸡蛋')]),records)
  assert.deepEqual(result.ingredients.map(i=>i.status),['known','possible'])
  assert.equal(result.conflictCount,1)
})
test('negation and cross contact are not positive ingredients', () => {
  const result=checkLabel(label([row('Milk-free','不含牛奶')],{advisory:[{original:'May contain milk',chinese:'可能含有牛奶',reliable:true}]}),records)
  assert.notEqual(result.ingredients[0].status,'known')
  assert.equal(result.conflictCount,0)
  assert.equal(result.advisory[0].status,'possible')
  assert.equal(result.tone,'warning')
})
test('incomplete label retains a known conflict and cannot pass green', () => {
  const result=checkLabel(label([row('cream (milk)','奶油')],{complete:false,issues:['配料末尾未拍全']}),records)
  assert.equal(result.ingredients[0].status,'known')
  assert.equal(result.tone,'error')
  assert.match(result.scope,/未完整/)
})
test('missing archive, unknown source and absent intake do not imply allergy or tolerance', () => {
  for(const rows of [[],records]) {
    const result=checkLabel(label([row('Peas','豌豆'),{...row('Hydrolysed vegetable protein','水解植物蛋白'),sourceUnknown:true}]),rows)
    assert.ok(result.ingredients.every(i=>i.status==='pending'))
    assert.notEqual(result.tone,'success')
  }
})
test('compound ingredients preserve parents, children, original order and more than 16 entries', () => {
  const input='Water, flour (wheat, salt), sugar, egg, milk, cocoa, oil, starch, yeast, carrot, onion, potato, peas, tomato, pepper, xanthan gum, citric acid'
  const rows=flattenIngredients(input)
  assert.equal(rows.length,19)
  assert.deepEqual(rows.slice(0,4).map(i=>i.original),['Water','flour','wheat','salt'])
  assert.equal(rows[2].parent,1)
})
test('contains conflicts count ingredient rows, not allergen species; no false duplication',()=>{
  const result=checkLabel(label([row('milk','牛奶'),row('whey','乳清')],{contains:[{original:'milk',chinese:'牛奶',reliable:true}]}),records)
  assert.equal(result.conflictCount,2)
  assert.equal(result.ingredients.length,2)
})
test('summary counts only ingredient items, not separate packaging statements',()=>{
  const result=checkLabel(label([row('water','水'),row('Peas','豌豆')],{contains:[row('乳及乳制品')]}),records)
  assert.equal(result.contains[0].status,'known')
  assert.equal(result.conflictCount,0)
  assert.equal(result.pendingCount,1)
  assert.match(result.counts,/已识别2项 · 0项已知冲突 · 1项待确认/)
})
test('unpunctuated Contains list is parsed only as whole affirmative dictionary names',()=>{
  assert.deepEqual(splitDeclaredAllergens('WHEAT SOY'),['WHEAT','SOY'])
  assert.deepEqual(splitDeclaredAllergens('Milk tree nuts'),['Milk','tree nuts'])
  assert.deepEqual(splitDeclaredAllergens('May contain milk'),['May contain milk'])
  assert.deepEqual(splitDeclaredAllergens('milk-free'),['milk-free'])
  assert.deepEqual(splitDeclaredAllergens('MILK unknown origin'),['MILK unknown origin'])
})
