import test from 'node:test'
import assert from 'node:assert/strict'
import {AIBusinessService} from './service.mjs'
import {validateExtraction} from './contract.mjs'
const service=new AIBusinessService({dataDirectory:'.codex-tmp/sleep-source-time',model:{}})
for(const clipped of [true,false])test('sleep clocks use their own dated evidence clause when model values omit the date '+clipped,()=>{
 const text='2026-10-24晚上10点睡，2026-10-25早上7点醒',sources=[{id:'fact-sleep',page:1,text,status:'readable'}]
 const output={items:[{category:'sleep',title:'睡眠',timeText:text,archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'sleepAt',value:'晚上10点',quote:clipped?'2026-10-24晚上10点睡':text,sourceId:'fact-sleep',page:1},{name:'wakeAt',value:'早上7点',quote:clipped?'2026-10-25早上7点醒':text,sourceId:'fact-sleep',page:1}]}]}
 const [item]=validateExtraction(output,sources,{preserveUnassigned:true})
 service.resolve(item,{frontDeskRecord:true,frontUnderstanding:{recordChangesPending:false},documents:[],sources,referenceNow:'2026-10-25T20:00:00Z',timezone:'Asia/Shanghai'})
 assert.equal(item.fields.find(f=>f.name==='sleepAt').resolvedValue,'2026-10-24T14:00:00.000Z')
 assert.equal(item.fields.find(f=>f.name==='wakeAt').resolvedValue,'2026-10-24T23:00:00.000Z')
 assert.equal(item.fields.find(f=>f.name==='sleepAt').value,'晚上10点')
 assert.equal(item.time.resolvedStart,'2026-10-24T14:00:00.000Z')
})
