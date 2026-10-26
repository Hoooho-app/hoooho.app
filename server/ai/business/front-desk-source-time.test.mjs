import test from 'node:test'
import assert from 'node:assert/strict'
import {frontDeskSourceTime} from './front-desk-source-time.mjs'
import {AIBusinessService} from './service.mjs'
const ref={sourceId:'amendment',page:1,quote:'昨晚'}
test('a midnight correction uses the correction message and preserves the old unchanged attribute date',()=>{
 const item={timeText:'昨晚',timeSources:[ref],fields:[]},source={id:'amendment',page:1,text:'不是今天，是昨晚',sourceAt:'2026-10-25T16:30:00Z'}
 assert.equal(frontDeskSourceTime(item,[source],'2026-10-25T15:30:00Z'),source.sourceAt)
 const service=new AIBusinessService({dataDirectory:'.codex-tmp/source-clock',model:{}})
 const actual={id:'item',category:'symptom',title:'咳嗽',timeText:'昨晚',timeSources:[ref],fields:[{name:'symptom',value:'咳嗽',sources:[{sourceId:'original',page:1,quote:'咳嗽'}],editedBy:'model'}]}
 service.resolve(actual,{frontDeskRecord:true,frontUnderstanding:{recordChangesPending:false},sources:[source,{id:'original',page:1,text:'咳嗽',sourceAt:'2026-10-25T15:30:00Z'}],documents:[],referenceNow:'2026-10-25T15:30:00Z',timezone:'Asia/Shanghai'})
 assert.equal(actual.time.resolvedStart?.slice(0,10),'2026-10-25')
})
test('missing time, manual edits, ambiguous anchors and absolute dates do not acquire a fabricated occurrence time',()=>{
 const base='2026-10-25T15:30:00Z',source={id:'amendment',page:1,text:'昨天',sourceAt:'2026-10-25T16:30:00Z'},item={timeText:'昨天',timeSources:[ref],fields:[]}
 assert.equal(frontDeskSourceTime({...item,timeText:null},[source],base),base)
 assert.equal(frontDeskSourceTime({...item,timeEditedBy:'user'},[source],base),base)
 assert.equal(frontDeskSourceTime(item,[{...source,sourceAt:'invalid'}],base),base)
 assert.equal(frontDeskSourceTime({...item,timeSources:[ref,{sourceId:'other',page:1}]},[source,{...source,id:'other',sourceAt:'2026-10-26T16:30:00Z'}],base),base)
 assert.equal(frontDeskSourceTime({...item,timeText:'2026-10-25'},[source],base),base)
})
