import test from 'node:test'
import assert from 'node:assert/strict'
import {activeSymptomFollowups,followupDate,symptomPreview} from './symptomFollowup'
import type {FollowedCase} from '../../features/case-continuity/types'
const item=(id:string,time:string|null,patch:Partial<FollowedCase['event']>={}):FollowedCase=>({event:{id,memberId:'a',accountId:'account',title:id,category:'other',status:'observing',startTime:'',createdAt:'',updatedAt:'2026-12-31',...patch},followup:{title:id,hasSymptom:true,supplement:null,recordCount:1,firstOccurredAt:time,latestOccurredAt:time,hasUnknownTime:!time},latest:null,observations:[],changedAt:'2026-12-31'})
test('home uses business occurrence time, stable ties, member ownership, active symptoms only',()=>{
  const input=[item('old','2026-10-01'),item('b','2026-10-02'),item('a','2026-10-02'),item('archived','2026-10-03',{caseArchivedAt:'2026-10-03'}),item('other','2026-10-04',{memberId:'b'}),item('ended','2026-10-05',{recoveredAt:'2026-10-05'}),{...item('sleep','2026-10-06'),followup:{...item('sleep',null).followup,hasSymptom:false}}]
  assert.deepEqual(activeSymptomFollowups(input,'a').map(item=>item.event.id),['b','a','old'])
  assert.equal(input.length,7)
})
test('followup dates use Shanghai and never fabricate missing dates',()=>{
  assert.equal(followupDate('2026-10-11T17:00:00Z'),'10/12')
  assert.equal(followupDate(null),null);assert.equal(followupDate('invalid'),null)
})

test('symptom preview uses saved detail and occurrence time, without repeating the title or inventing missing facts',()=>{
 const value=item('瘙痒','2026-10-16T17:30:00Z')
 value.followup.description='头皮发痒，反复抓挠'
 assert.deepEqual(symptomPreview(value),{description:'头皮发痒，反复抓挠',latest:'10/17 01:30'})
 value.followup.description='瘙痒';value.followup.latestOccurredAt=null
 assert.deepEqual(symptomPreview(value),{description:null,latest:null})
 value.followup.supplement='夜间更明显'
 assert.equal(symptomPreview(value).description,'夜间更明显')
})
