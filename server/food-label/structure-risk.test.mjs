import test from 'node:test'
import assert from 'node:assert/strict'
import {flattenIngredients,checkLabel} from './rules.mjs'

const record=(name,currentStatus='confirmed',extra={})=>({id:`test-${name}`,name,category:'food',currentStatus,...extra})
const check=(text,records=[],extra={})=>checkLabel({ingredients:flattenIngredients(text).map(row=>({...row,chinese:row.original,reliable:true})),contains:[],advisory:[],complete:false,issues:[],...extra},records)
const sample='大米（≥60%）、白砂糖、植物油（含特丁基对苯二\n酚）、米粉、淀粉、食用盐、食品添加剂（明胶、5\n′-呈味核苷酸二钠）、味精'

test('original label has eight roots, full bracket evidence, and additive children',()=>{
  const result=check(sample)
  assert.equal(result.displayIngredients.length,8)
  assert.equal(result.displayIngredients[2].original,'植物油（含特丁基对苯二酚）')
  assert.equal(result.displayIngredients[6].original,'食品添加剂（明胶、5′-呈味核苷酸二钠）')
  assert.deepEqual(result.displayIngredients[6].children.map(r=>r.name),['明胶','5′-呈味核苷酸二钠'])
  assert.equal(result.conflictCount,0)
  assert.ok(result.displayIngredients.every(r=>r.status==='clear'))
})
test('nested compounds aggregate known children into one root conflict',()=>{
  const result=check('Bread (filling [milk, egg], wheat flour), Water',[record('牛奶'),record('鸡蛋'),record('小麦')])
  assert.equal(result.displayIngredients.length,2)
  assert.equal(result.conflictCount,1)
  assert.equal(result.displayIngredients[0].status,'known')
  assert.equal(result.displayIngredients[0].hits.filter(h=>h.status==='known').length,3)
  assert.match(result.displayIngredients[0].reason,/milk.*egg.*wheat flour/i)
})
test('common allergens are properties, not personal diagnoses; uncommon exact allergies still match',()=>{
  const result=check('Mustard, Celery, Lupin, Molluscs, Milk, Mango, Sugar',[record('Mango')])
  assert.deepEqual(result.displayIngredients.map(r=>r.status),['common','common','common','common','common','known','clear'])
})
test('specific tree nuts do not match a different nut; negation never becomes positive',()=>{
  assert.equal(check('Almond',[record('腰果')]).displayIngredients[0].status,'common')
  assert.equal(check('Almond',[record('杏仁')]).displayIngredients[0].status,'known')
  assert.equal(check('Oyster',[record('蛤蜊')]).displayIngredients[0].status,'common')
  assert.equal(check('Oyster',[record('牡蛎')]).displayIngredients[0].status,'known')
  assert.equal(check('Milk-free',[record('牛奶')]).displayIngredients[0].status,'clear')
})
test('only evidence-backed personal uncertainty produces explained possible risk',()=>{
  for(const text of ['明胶','植物油','食品添加剂（明胶、5′-呈味核苷酸二钠）','面包','陌生成分'])assert.equal(check(text).displayIngredients[0].status,'clear')
  const bread=check('Bread',[record('小麦')]).displayIngredients[0]
  assert.equal(bread.status,'possible');assert.match(bread.reason,/小麦/);assert.equal(bread.children.length,0)
  assert.equal(check('Bread (rice flour, water, yeast)',[record('小麦')]).displayIngredients[0].status,'clear')
  const gelatin=check('Gelatin',[record('鱼类')]).displayIngredients[0]
  assert.equal(gelatin.status,'possible');assert.match(gelatin.reason,/鱼类/)
  assert.equal(check('植物油（含特丁基对苯二酚）',[record('牛奶')]).displayIngredients[0].status,'clear')
  assert.equal(check('Egg',[record('鸡蛋','suspected')]).displayIngredients[0].status,'possible')
  assert.equal(check('Gelatin',[record('牛肉')]).displayIngredients[0].status,'possible')
  assert.equal(check('Peanut oil',[record('花生')]).displayIngredients[0].status,'possible')
  assert.match(check('Peanut oil',[record('花生')]).displayIngredients[0].reason,/精炼/)
  assert.equal(check('Peanut oil',[record('Peanut oil')]).displayIngredients[0].status,'known')
  assert.equal(check('Highly refined peanut oil',[record('花生')]).displayIngredients[0].status,'clear')
})
test('label facts and personal evidence gate risk; translations cannot invent milk',()=>{
  const result=check('ImaginaryName',[record('牛奶')])
  result.ingredients[0].chinese='牛奶'
  assert.equal(checkLabel({...result,complete:false,issues:[]},[record('牛奶')]).displayIngredients[0].status,'clear')
  assert.equal(check('Milk',[record('牛奶','confirmed',{conditionType:'intolerance'})]).displayIngredients[0].status,'common')
  assert.equal(check('Milk',[record('牛奶','tolerated')]).displayIngredients[0].status,'common')
})
test('may contain stays packaging evidence and never increases root conflict count',()=>{
  const result=check('Rice',[record('牛奶')],{advisory:[{original:'May contain milk',chinese:'可能含有牛奶',reliable:true}]})
  assert.equal(result.conflictCount,0);assert.equal(result.displayIngredients.length,1)
  assert.equal(result.advisory[0].status,'possible');assert.match(result.advisory[0].reason,/牛奶/)
  assert.equal(check('Rice',[record('Mango')],{advisory:[{original:'May contain mango',reliable:true}]}).advisory[0].status,'possible')
})
test('partial label is not a risk and only roots are counted',()=>{
  const result=check('Rice, ≥60%, Bread (Milk, Egg), →, Sugar',[record('牛奶')])
  assert.equal(result.displayIngredients.length,3);assert.equal(result.conflictCount,1)
  assert.equal(result.counts,'已识别3项 · 1项已知冲突')
  assert.doesNotMatch(result.scope??'',/补拍|未完整|待确认/)
})
