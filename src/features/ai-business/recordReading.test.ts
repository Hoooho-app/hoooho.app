import test from 'node:test'
import assert from 'node:assert/strict'
import {recordReading,recordKeywords,refreshRecordKeywords} from '../../../shared/front-desk-record-format.mjs'

test('record reading opens only overview and keywords while preserving every remaining section',()=>{
 const text='【情况概述】\n昨晚有点发热，精神和平时一样。\n\n【关键词】\n发热\n\n【发生与变化】\n昨晚开始\n\n【具体表现与测量】\n体温38.6℃\n\n【精神与生活表现】\n精神和平时一样\n\n【已做处理及反应】\n暂无处理说明'
 const reading=recordReading(text)
 assert.equal(reading.overview,'昨晚有点发热，精神和平时一样。')
 assert.deepEqual(reading.keywords,['发热','体温38.6℃'])
 assert.deepEqual(reading.details.map(section=>section.title),['发生与变化','具体表现与测量','精神与生活表现','已做处理及反应'])
 assert.equal(reading.details[1].text,'体温38.6℃')
})
test('legacy headings retain their full text and negative/uncertain facts are not positive keywords',()=>{
 const reading=recordReading('【情况描述】\n有红点，没有发热，担心是不是过敏。\n\n【日常表现】\n精神和平时一样\n\n【补充观察】\n还没量体温')
 assert.deepEqual(reading.keywords,['红点'])
 assert.equal(reading.details[0].title,'精神与生活表现')
 assert.equal(reading.details[1].text,'还没量体温')
 assert.deepEqual(recordKeywords('头痛已排除，可能过敏，没有发热'),[])
})

test('editing a structured record cannot leave a retracted symptom in the derived keywords',()=>{
 const text='【情况概述】\n没有发热，有点咳嗽。\n\n【关键词】\n发热\n\n【具体表现与测量】\n没有发热，有点咳嗽。'
 const refreshed=refreshRecordKeywords(text)
 assert.deepEqual(recordReading(refreshed).keywords,['咳嗽'])
 assert.match(refreshed,/没有发热/);assert.doesNotMatch(refreshed,/【关键词】\n发热/)
})
test('estimated or another person\'s temperature is not presented as a measured keyword, including stale headings',()=>{
 assert.deepEqual(recordKeywords('估计体温38.6℃。妈妈体温39.1℃。如果体温40.2℃。'),[])
 const reading=recordReading('【情况概述】\n估计体温38.6℃，还未测量。\n\n【关键词】\n体温38.6℃')
 assert.deepEqual(reading.keywords,[])
 assert.deepEqual(recordKeywords('测得体温38.6℃。'),['体温38.6℃'])
})
