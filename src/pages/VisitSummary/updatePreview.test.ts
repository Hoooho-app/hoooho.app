import assert from 'node:assert/strict'
import test from 'node:test'
import type { VisitSheet, VisitSource } from '../../types/visitSheet'
import { sourceChanges } from './updatePreview'

const source: VisitSource = {id:'record:one',category:'course',title:'皮肤观察',text:'局部发红',narrative:'局部发红',occurredAt:'2026-09-01',createdAt:'2026-09-01',updatedAt:null,identity:'家长陈述',destinations:['course']}
const report = (sources: VisitSource[]) => ({sources} as VisitSheet)
test('资料编号和采集时间变化不冒充病情变化',()=>{
  assert.deepEqual(sourceChanges(report([source]),report([{...source,code:'S99',updatedAt:'2026-10-07'}])),{added:[],changed:[],removed:[]})
})
test('新增、更正和不再纳入分别展示，并保留更正后原文',()=>{
  const changed={...source,text:'局部发红，已缓解'},added={...source,id:'record:two'},removed={...source,id:'record:old'}
  assert.deepEqual(sourceChanges(report([source,removed]),report([changed,added])),{added:[added],changed:[changed],removed:[removed]})
})
test('实际发生时间更正需要提示有变化',()=>{
  const changed={...source,occurredAt:'2026-09-02'}
  assert.deepEqual(sourceChanges(report([source]),report([changed])).changed,[changed])
})
