import assert from 'node:assert/strict'
import test from 'node:test'
import { LOCATOR_CATEGORIES, applicableLocation, bodyLocationLabel, coarseSelection, drawableSelectionIds, locatorRegion, locatorSelection, toggleLocatorSelection } from './locatorDictionary.ts'
import { CHILD_LOCATIONS } from './childBodyCatalog.ts'
import { fromSymptomLocations, toSymptomLocations } from '../../pages/HealthEvents/symptomRecordLogic.ts'
import { locatorVisual,locatorZones } from './locatorGeometry.ts'
test('unified category has no default side; coarse and fine observations coexist and round-trip',()=>{
  const hand=LOCATOR_CATEGORIES.find(c=>c.id==='hand')!
  assert.equal(hand.regions.length,2);assert.equal(locatorRegion(hand,''),undefined)
  const coarse=coarseSelection(hand,'','neutral'),palm=locatorSelection('hand_left_palm_center','neutral')
  const values=toggleLocatorSelection([coarse],palm)
  assert.equal(values.length,2);assert.match(coarse.label,/左右与具体位置待补充/)
  assert.equal(palm.surface,'palmar');assert.equal(palm.laterality,'left');assert.equal(palm.precision,'region')
  const saved=toSymptomLocations(values)
  assert.deepEqual(toSymptomLocations(fromSymptomLocations(saved)),saved)
  assert.equal(saved[1].dictionaryVersion,'2.0.0');assert.equal(saved[1].markedArea,undefined)
  assert.equal(toggleLocatorSelection(values,palm).length,1)
  assert.equal(coarseSelection(hand,'left','neutral').laterality,'left')
})
test('numbered legacy labels normalize for display only and uncertain numeric names keep their original text',()=>{
  assert.equal(bodyLocationLabel({id:'head_crown',label:'3号区域'}),'头顶')
  assert.equal(bodyLocationLabel({id:'old',label:'左肘窝1号区域'}),'左肘窝')
  assert.equal(bodyLocationLabel({id:'unknown',label:'3号区'}),'3号区（位置待补充）')
  assert.equal(bodyLocationLabel({id:'unknown',label:'3号区'}),'3号区（位置待补充）')
  assert.equal(bodyLocationLabel({id:'other',label:'原有位置'}),'原有位置')
  const raw={id:'unknown',label:'3号区',locationNumber:1,locationLayer:'surface' as const,localRegion:'x=2,y=3',markedArea:'legacy original'}
  assert.deepEqual(JSON.parse(JSON.stringify(toSymptomLocations(fromSymptomLocations([raw])))),[raw])
  assert.deepEqual(drawableSelectionIds([{id:'head_crown',label:'旧图原位置',locationType:'surface'},locatorSelection('head_crown','girl')]),['head_crown'])
})
test('all mapped paths have finite source-aligned bounds; hand and head views have distinct supported regions',()=>{
  for(const model of ['boy','girl','neutral'] as const)for(const c of LOCATOR_CATEGORIES)for(const r of c.regions)for(const view of r.views)for(const angle of ['palm','dorsal','plantar','medial','lateral'] as const){
    const v=locatorVisual(model,view,r,angle);if(!v)continue
    for(const z of locatorZones(model,view,r,v)){
      assert.ok(CHILD_LOCATIONS.has(z.id));assert.ok(!/NaN|Infinity/.test(z.path),z.id)
      assert.ok(z.bounds.every(Number.isFinite));assert.ok(z.bounds[2]>0&&z.bounds[3]>0)
    }
  }
  const hand=locatorRegion(LOCATOR_CATEGORIES.find(c=>c.id==='hand'),'left')!
  const palmar=locatorZones('girl','front',hand,locatorVisual('girl','front',hand,'palm')!)
  const dorsal=locatorZones('girl','front',hand,locatorVisual('girl','front',hand,'dorsal')!)
  assert.ok(palmar.some(z=>z.id==='hand_left_palm_center'));assert.ok(!dorsal.some(z=>z.id==='hand_left_palm_center'))
  assert.equal(applicableLocation(CHILD_LOCATIONS.get('external_genital_penis_skin')!,'neutral'),false)
})
