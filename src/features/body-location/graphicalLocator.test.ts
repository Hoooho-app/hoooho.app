import {test} from 'node:test'
import assert from 'node:assert/strict'
import {CHILD_REGIONS} from './childBodyCatalog'
import {graphicalRegionLabel,graphicalSelection,graphicalVisual,graphicalZones} from './graphicalLocator'
import {toSymptomLocations,fromSymptomLocations} from '../../pages/HealthEvents/symptomRecordLogic'
const region=(id:string)=>CHILD_REGIONS.find(r=>r.id===id)!
test('whole fingers and palm have distinct honest identities that survive journal projection',()=>{
 for(const model of ['girl','boy','neutral'] as const)for(const side of ['left','right']){
  const r=region(`hand_${side}`),visual=graphicalVisual(model,'front',r,'palm')!,zones=graphicalZones(model,'front',r,visual)
  assert.equal(zones.length,6)
  assert.equal(zones.filter(z=>z.id.endsWith('_whole')).length,5)
  for(const z of zones){const value=graphicalSelection(z.id,model);assert.equal(value.laterality,side);assert.ok(!/指尖|掌侧|掌心|待补充/.test(value.label));const restored=fromSymptomLocations(toSymptomLocations([value]));assert.equal(restored[0].id,value.id);assert.equal(restored[0].label,value.label)}
 }
})
test('root provides both anatomical sides and local limb view groups matching sides',()=>{
 for(const model of ['girl','boy','neutral'] as const){
  const root=graphicalVisual(model,'front')!,zones=graphicalZones(model,'front',undefined,root)
  assert.ok(zones.some(z=>z.id==='hand_left'));assert.ok(zones.some(z=>z.id==='hand_right'))
  assert.equal(graphicalRegionLabel(region('elbow_left')),'左手臂');assert.equal(graphicalRegionLabel(region('knee_left')),'左腿');assert.equal(graphicalRegionLabel(region('hand_left')),'左手')
  const r=region('elbow_left'),v=graphicalVisual(model,'front',r)!,local=graphicalZones(model,'front',r,v)
  assert.ok(local.some(z=>z.id==='elbow_left_whole'));assert.ok(local.every(z=>!z.id.includes('_right')))
 }
})
test('face eyes keep their own laterality, feet select a whole toe rather than a surface',()=>{
 const r=region('head'),v=graphicalVisual('girl','front',r)!,zones=graphicalZones('girl','front',r,v)
 for(const side of ['left','right'])assert.equal(graphicalSelection(zones.find(z=>z.id===`graphic_face_eye_${side}`)!.id,'girl').laterality,side)
 const f=region('foot_left'),fv=graphicalVisual('girl','front',f,'dorsal')!,fz=graphicalZones('girl','front',f,fv)
 assert.equal(fz.length,6);assert.equal(graphicalSelection(fz[0].id,'girl').surface,'circumferential')
})

test('graphical location is accepted and preserved by the server journal contract',async()=>{
 const {validateJournal}=await import('../../../server/events/journal-metadata.mjs')
 const r=region('hand_left'),v=graphicalVisual('girl','front',r,'palm')!
 const id=graphicalZones('girl','front',r,v).find(z=>z.id==='graphic_hand_left_palm')!.id
 const locations=toSymptomLocations([graphicalSelection(id,'girl')])
 const saved=validateJournal({categories:['symptom'],symptom:{symptomCategory:'skin',narrative:'手掌发红',keywords:[],locations,descriptors:[],linkedRecordIds:{}}})
 assert.equal(saved.symptom.locations[0].id,id);assert.equal(saved.symptom.locations[0].label,'左手掌');assert.equal(saved.symptom.locations[0].surface,'palmar');assert.equal(saved.symptom.locations[0].coverage,'whole');assert.equal(saved.symptom.locations[0].modelAtSelection,'girl');assert.equal(saved.symptom.locations[0].schemaVersion,undefined)
})
