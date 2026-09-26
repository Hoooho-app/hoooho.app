import assert from 'node:assert/strict'
import test from 'node:test'
import { CHILD_REGIONS, CHILD_LOCATIONS, isChildSelection, resolveChildModel, toChildSelection, toggleChildSelection, confirmChildSelection } from './childBodyCatalog.ts'
import { childVisual, locationPoint, regionPolygon, geometryCompatible } from './childBodyGeometry.ts'
import { fromSymptomLocations, toSymptomLocations } from '../../pages/HealthEvents/symptomRecordLogic.ts'

test('full dictionary is unique, paired, model-specific and has a reachable region visual or explicit text path',()=>{
  assert.equal(CHILD_REGIONS.length,40); assert.equal(CHILD_LOCATIONS.size,569)
  for(const model of ['boy','girl'] as const){
    const ids=CHILD_REGIONS.flatMap(region=>region.items.filter(item=>item.sex.includes(model)))
    assert.equal(ids.length,model==='boy'?561:562)
    for(const region of CHILD_REGIONS){
      if(region.pairedRegionId) assert.equal(CHILD_REGIONS.find(r=>r.id===region.pairedRegionId)?.pairedRegionId,region.id)
      for(const view of region.views){
        assert.ok(regionPolygon(model,view,region))
        const visual=childVisual(model,view,region)
        assert.ok(visual || ['groin_left','groin_right','external_genital','perineum'].includes(region.id))
      }
      for(const item of region.items.filter(item=>item.sex.includes(model))){
        assert.equal(toChildSelection(item.id,model).label,item.label)
      }
    }
  }
  assert.equal(resolveChildModel('female'),'girl'); assert.equal(resolveChildModel('male'),'boy')
  for(const unknown of [null,undefined,'undisclosed','',0,1,2,'girl'])assert.equal(resolveChildModel(unknown),null)
})
test('whole fingers coexist; region broad options only replace their own current-version region',()=>{
  let values=[toChildSelection('face_lower_eyelid_left','girl')]
  values=toggleChildSelection(values,'hand_left_thumb_whole','girl')
  values=toggleChildSelection(values,'hand_left_index_whole','girl')
  assert.equal(values.length,3)
  values=toggleChildSelection(values,'hand_left_whole','girl')
  assert.deepEqual(values.map(v=>v.id),['face_lower_eyelid_left','hand_left_whole'])
  values=toggleChildSelection(values,'hand_left_palm_center','girl')
  assert.deepEqual(values.map(v=>v.id),['face_lower_eyelid_left','hand_left_palm_center'])
  values=toggleChildSelection(values,'hand_left_palm_center','girl')
  assert.equal(values.length,1)
})
test('legacy overlaps, unknown IDs, side, point description and label snapshots survive save/reopen unchanged',()=>{
  const original=[{id:'head_crown',label:'旧头顶名称',locationNumber:1,locationLayer:'surface' as const,bodySide:'center' as const,bodyView:'front' as const,bodyRegion:'head',localRegion:'旧图原坐标描述',markedArea:'legacy x=20,y=30'}, {id:'unknown-old-id',label:'旧部位',locationNumber:2,locationLayer:'surface' as const,localRegion:'旧部位'}]
  const values=fromSymptomLocations(original)
  assert.equal(isChildSelection(values[0]),false)
  assert.deepEqual(toSymptomLocations(values).map(item=>JSON.parse(JSON.stringify(item))),original)
  const known=toChildSelection('head_crown','girl')
  assert.equal(toggleChildSelection(values,known.id,'girl').length,3)
  const conflict=[toChildSelection('hand_left_whole','girl'),toChildSelection('hand_left_palm_center','girl')]
  assert.equal(confirmChildSelection(conflict,'a','a').length,2)
  assert.equal(toggleChildSelection(conflict,'hand_left_palm_thumb','girl').length,2)
})
test('confirm accepts an empty result, isolates child ownership and round-trips all new semantics',()=>{
  assert.deepEqual(confirmChildSelection([],'a','a'),[])
  assert.throws(()=>confirmChildSelection([],'a','b'),/对象已变化/)
  const original=[toChildSelection('face_lower_eyelid_left','girl'),toChildSelection('foot_left_arch','girl')]
  const saved=toSymptomLocations(original)
  assert.equal(saved[1].surface,'plantar');assert.equal(saved[1].bodySide,'left');assert.equal(saved[1].schemaVersion,'1.0.0')
  assert.deepEqual(toSymptomLocations(fromSymptomLocations(saved)),saved)
})
test('front/back and atlas source use actual corresponding files; hidden details never get wrong-surface points',()=>{
  assert.equal(geometryCompatible(),true)
  for(const model of ['boy','girl'] as const){
    assert.equal(childVisual(model,'back',CHILD_REGIONS.find(r=>r.id==='head')!)?.asset,`assets/${model}-back.png`)
    for(const side of ['left','right'])for(const part of ['hand','foot']){
      const region=CHILD_REGIONS.find(r=>r.id===`${part}_${side}`)!
      const visual=childVisual(model,'front',region,part==='hand'?'palm':'plantar')!
      assert.equal(visual.asset,`assets/${part}-${side}.png`)
    }
  }
  const foot=CHILD_REGIONS.find(r=>r.id==='foot_left')!, arch=CHILD_LOCATIONS.get('foot_left_arch')!
  assert.equal(locationPoint('girl','front',foot,childVisual('girl','front',foot,'dorsal')!,arch),null)
  assert.ok(locationPoint('girl','front',foot,childVisual('girl','front',foot,'plantar')!,arch))
  const face=CHILD_REGIONS.find(r=>r.id==='face')!
  assert.equal(locationPoint('girl','front',face,childVisual('girl','front',face)!,CHILD_LOCATIONS.get('face_tongue_tip')!),null)
  for(const region of CHILD_REGIONS)for(const view of region.views)for(const model of ['boy','girl'] as const)for(const angle of ['palm','dorsal','plantar','medial','lateral'] as const){
    const visual=childVisual(model,view,region,angle)
    if(!visual)continue
    for(const item of region.items){const p=locationPoint(model,view,region,visual,item);if(p)assert.ok(p.every(n=>n>=0&&n<=1),`${item.id} outside source image`)}
  }
})
