import test from 'node:test'
import assert from 'node:assert/strict'
import {activeSymptomFollowups,followupDate} from './symptomFollowup'
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
