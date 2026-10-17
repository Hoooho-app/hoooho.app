import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReviewComparison, isVoucherReviewRange } from './reviewComparison.ts'
import type { ReviewSources } from '../../pages/RecentReview/reviewModel.ts'
import type { HealthEventApiDto, HealthEventRecordApiDto } from '../../types/index.ts'
const now=new Date('2026-10-18T12:00:00Z')
const event=(id:string,memberId='child'):HealthEventApiDto=>({id,memberId,accountId:'a',title:id,category:'other',status:'observing',startTime:'2026-10-18T01:00:00Z',createdAt:'2026-10-18T01:00:00Z',updatedAt:'2026-10-18T01:00:00Z'})
const record=(id:string,eventId:string,at:string,categories:('diet'|'symptom'|'sleep'|'medication'|'other')[]):HealthEventRecordApiDto=>({id,eventId,accountId:'a',type:'note',content:id,occurredAt:at,createdAt:'2026-10-18T10:00:00Z',updatedAt:'2026-10-18T10:00:00Z',journal:{categories,timePrecision:'exact'}})
const sources=():ReviewSources=>({index:{events:[],records:[],attachments:[]},profiles:[],cases:{active:[],archived:[],timezone:'Asia/Shanghai',today:'2026-10-18'},reminders:[]})
test('voucher range is seven inclusive China calendar days, including leap day; malformed/future ranges fail',()=>{
 assert.equal(isVoucherReviewRange('2026-10-12','2026-10-18',now),true)
 assert.equal(isVoucherReviewRange('2024-02-24','2024-03-01',now),true)
 for(const range of [['2026-10-11','2026-10-18'],['2026-10-13','2026-10-18'],['2026-10-13','2026-10-19'],['2026-02-30','2026-03-08'],['2026-10-18','2026-10-12']])assert.equal(isVoucherReviewRange(...range as [string,string],now),false)
})
test('comparison keeps day grouping and actual occurrence chronology, without summing unrelated categories',()=>{
 const d=sources();d.index.events=[event('e')]
 d.index.records=[record('backfill','e','2026-10-17T15:50:00Z',['diet']),record('later','e','2026-10-18T00:10:00Z',['diet']),record('mixed','e','2026-10-18T01:00:00Z',['diet','symptom'])]
 const days=buildReviewComparison(d,'child','2026-10-12','2026-10-18',now)
 assert.deepEqual(days.map(d=>d.day),['2026-10-18','2026-10-17'])
 assert.deepEqual(days[0].columns.diet.map(r=>r.id),['mixed','later'])
 assert.equal(days[0].columns.symptom[0].id,'mixed');assert.equal(days[0].columns.sleep.length,0)
})
test('foreign account, other child, pending, unknown and future facts are not promoted into comparison',()=>{
 const d=sources();d.index.events=[event('e'),event('other','sibling')]
 const good=record('good','e','2026-10-18T01:00:00Z',['symptom'])
 d.index.records=[good,{...good,id:'foreign',accountId:'b'},record('sibling','other','2026-10-18T01:00:00Z',['diet']),{...good,id:'pending',caseContext:{identity:'pending'}},{...good,id:'unknown',journal:{categories:['symptom'],timePrecision:'unknown'}},record('future','e','2026-10-18T23:00:00Z',['diet'])]
 const days=buildReviewComparison(d,'child','2026-10-12','2026-10-18',now)
 assert.deepEqual(days.flatMap(d=>Object.values(d.columns).flat()).map(r=>r.id),['good'])
})
