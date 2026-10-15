import test from 'node:test'
import assert from 'node:assert/strict'
import {mergeSuggestion} from './mergeSuggestion'
import type {FollowedCase} from './types'
const item=(id:string,title:string,extra:Partial<FollowedCase>={}):FollowedCase=>({event:{id,memberId:'member',updatedAt:'2026-10-15T00:00:00Z'},followup:{title,hasSymptom:true,latestOccurredAt:'2026-10-15T00:00:00Z'},...extra} as FollowedCase)
test('相关记录仅供用户确认：同部位或相同表现，不将时间接近当作因果',()=>{
 const a=item('a','颈部发痒'),b=item('b','颈部皮疹')
 assert.equal(mergeSuggestion([a,b])?.title,'皮疹伴瘙痒')
 assert.equal(mergeSuggestion([a,item('c','腹泻')]),null)
 assert.equal(mergeSuggestion([a,item('c','脚部皮疹')]),null)
 assert.equal(mergeSuggestion([item('a','鼻塞'),item('b','鼻塞加重')])?.source.event.id,'b')
})
test('分开保留、人物、时间、非症状与当前保存范围均受约束',()=>{
 const a=item('a','颈部发痒'),b=item('b','颈部皮疹')
 assert.equal(mergeSuggestion([{...a,event:{...a.event,caseSeparateIds:['b']}},b]),null)
 assert.equal(mergeSuggestion([a,{...b,event:{...b.event,memberId:'other'}}]),null)
 assert.equal(mergeSuggestion([a,{...b,followup:{...b.followup,latestOccurredAt:'2026-09-01T00:00:00Z'}}]),null)
 assert.equal(mergeSuggestion([a,{...b,followup:{...b.followup,hasSymptom:false}}]),null)
 assert.equal(mergeSuggestion([a,b],['unrelated']),null)
})
