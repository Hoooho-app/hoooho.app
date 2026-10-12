import test from 'node:test'
import assert from 'node:assert/strict'
import { smartRecordTimeLabel, type SmartRecordItem } from './smartRecordTypes.ts'

const item: SmartRecordItem = { id:'item',category:'activity',title:'户外活动',timeText:null,time:{resolvedStart:'2026-10-11T21:37:42+08:00',precision:'exact',defaulted:true},fields:[] }
test('缺省录入时间显示本地日期时分，历史原话和未知时间保持原样',()=>{
  const expected=new Date(item.time.resolvedStart!).toLocaleString('zh-CN',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
  assert.equal(smartRecordTimeLabel(item),`${expected}（录入时间）`)
  assert.equal(smartRecordTimeLabel({...item,timeText:'昨天晚上'}),'昨天晚上')
  assert.equal(smartRecordTimeLabel({...item,time:{resolvedStart:null,precision:'unknown'}}),'待确认')
})
