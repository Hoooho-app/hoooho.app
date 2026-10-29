import {test} from 'node:test'
import assert from 'node:assert/strict'
import {removeLocationAndMatchingText,removeLocationSelection} from './selectionRemoval'
import {toChildSelection} from './childBodyCatalog'
import {toSymptomLocations} from '../../pages/HealthEvents/symptomRecordLogic'

test('removing a location also removes only identical manual text, without resurrecting the fact',()=>{
 const elbow=toChildSelection('elbow_left_crease','girl'),wrist=toChildSelection('wrist_left_crease','girl')
 const removed=removeLocationAndMatchingText([elbow,wrist],`  ${wrist.label}  `,wrist)
 assert.deepEqual(removed.locations,[elbow]);assert.equal(removed.locationText,'')
 assert.equal(removeLocationAndMatchingText([elbow,wrist],'衣袖接触处',wrist).locationText,'衣袖接触处')
 assert.deepEqual(removeLocationAndMatchingText([wrist],wrist.label,wrist),{locations:[],locationText:''})
})
test('removal preserves other historical snapshots and renumbers the remaining saved locations',()=>{
 const removed=toChildSelection('chest_upper_left','boy'),snapshot={id:'legacy-old',label:'原图定位',locationNumber:2,locationLayer:'surface' as const,markedArea:'原坐标12,34',localRegion:'旧说明'}
 const legacy={id:snapshot.id,label:snapshot.label,locationType:'surface' as const,recordSnapshot:snapshot}
 const result=removeLocationSelection([removed,legacy],removed)
 assert.equal(result[0],legacy);assert.equal(legacy.recordSnapshot,snapshot)
 assert.deepEqual(toSymptomLocations(result).map(x=>({id:x.id,markedArea:x.markedArea,locationNumber:x.locationNumber})),[{id:'legacy-old',markedArea:'原坐标12,34',locationNumber:1}])
})
