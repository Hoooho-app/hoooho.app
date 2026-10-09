import test from 'node:test'
import assert from 'node:assert/strict'
import { finderPlan, findRecords, finderAnswer, lookupRecords, orderLookupMatches } from './recordFinderModel'
import { searchJournalEntries } from '../HealthEvents/timeViewModel'
import type { JournalEntry } from '../HealthEvents/timeViewModel'
const now = new Date('2026-10-09T14:00:00Z')
const row = (id: string, content: string, occurredAt: string, patch: Partial<JournalEntry> = {}): JournalEntry => ({ id, eventId: 'matter', content, occurredAt, createdAt: '2026-10-09T12:00:00Z', categories: ['symptom'], timePrecision: 'exact', attachmentCount: 0, status: 'observing', ...patch })
test('最早按每条真实发生时间，不按补记时间或最后一次更新；不作绝对首次判断', () => {
 const rows = [row('later','红屁股','2026-09-12T10:00:00Z'),row('backfill','红屁股','2026-08-01T10:00:00Z'),row('unknown','红屁股','2026-07-01T10:00:00Z',{timePrecision:'unknown'})]
 const plan=finderPlan('第一次红屁股是什么时候',undefined,now),found=findRecords(rows,plan)
 assert.equal(found[0].entry.id,'backfill');assert.equal(found.at(-1)?.related,true);assert.match(finderAnswer(found,plan),/已有记录中最早明确写到/);assert.match(finderAnswer(found,plan),/不能确定现实中第一次/)
})
test('否定与相近表达分开，不把湿疹或痘痘等同红疹',()=>{
 const rows=[row('yes','脸颊红疹','2026-09-01T10:00:00Z'),row('no','没有红疹','2026-08-01T10:00:00Z'),row('near','腿上痘痘','2026-07-01T10:00:00Z')]
 const found=findRecords(rows,finderPlan('第一次红疹什么时候',undefined,now))
 assert.equal(found[0].entry.id,'yes');assert.equal(found[1].related,true);assert.equal(found[2].related,true)
})
test('最近两个月的新食物包括首次尝试结构字段，普通饮食不当作新食物',()=>{
 const rows=[row('new','吃了香蕉','2026-09-12T10:00:00Z',{categories:['diet'],diet:{kind:'complementary',firstTryFoods:['香蕉']}}),row('old','第一次吃鸡蛋','2026-06-01T10:00:00Z',{categories:['diet']}),row('ordinary','喝了奶','2026-09-01T10:00:00Z',{categories:['diet']})]
 const found=findRecords(rows,finderPlan('最近两个月有没有吃新东西',undefined,now))
 assert.deepEqual(found.map(m=>[m.entry.id,m.related]),[['new',false],['ordinary',true]])
})
test('继续筛选保留问题与时间范围，查看某次变化仅限实际关联事项',()=>{
 const rows=[row('face','脸上红疹','2026-09-12T10:00:00Z',{eventId:'face'}),row('butt','屁股红疹','2026-09-11T10:00:00Z',{eventId:'butt'}),row('better','屁股红疹好转','2026-09-13T10:00:00Z',{eventId:'butt'}),row('other','脸上发红','2026-09-14T10:00:00Z',{eventId:'butt'})]
 const initial=finderPlan('最近两个月红疹后来有什么变化',undefined,now),refined=finderPlan('只看屁股上的',initial,now)
 assert.equal(refined.from,initial.from);assert.match(refined.question,/最近两个月/);assert.deepEqual(findRecords(rows,refined).map(m=>m.entry.id),['better','butt'])
})
test('支持用药、睡眠和任意文本；不存在的记录不推断未发生',()=>{
 const rows=[row('med','药名：西替利嗪','2026-09-01T10:00:00Z',{categories:['medication']}),row('sleep','午睡频繁醒来','2026-09-01T10:00:00Z',{categories:['sleep']})]
 assert.equal(findRecords(rows,finderPlan('西替利嗪的记录',undefined,now))[0].entry.id,'med')
 assert.equal(findRecords(rows,finderPlan('睡眠',undefined,now))[0].entry.id,'sleep')
 const plan=finderPlan('草莓',undefined,now);assert.match(finderAnswer(findRecords(rows,plan),plan),/没有记录不代表没有发生/)
})

test('普通查找与健康随记放大镜共用时间、同义词、结构字段和排除匹配', () => {
 const rows = [row('fever','发热 38℃','2026-10-01T10:00:00Z'), row('med','护理','2026-10-02T10:00:00Z',{categories:['medication'],medication:{medicationName:'阿司匹林'}}),row('diet','喝了牛奶','2026-10-02T11:00:00Z',{categories:['diet']})]
 for (const query of ['发烧', '上周用药', '  阿司 匹林  ', '用药 不含牛奶', '没有的关键词']) {
   assert.deepEqual(lookupRecords(rows,query,now).map(match=>match.entry.id),searchJournalEntries(rows,query,now).map(entry=>entry.id))
 }
})
test('显式缩小当前结果只查原结果，支持只看前缀，不混入其他事项', () => {
 const rows=[row('face','脸颊红疹','2026-10-02T10:00:00Z'),row('butt','屁股红疹','2026-10-01T10:00:00Z'),row('outside','脸颊擦伤','2026-10-03T10:00:00Z')]
 const scope=lookupRecords(rows,'红疹',now).map(match=>match.entry)
 assert.deepEqual(lookupRecords(scope,'只看脸颊',now).map(match=>match.entry.id),['face'])
 assert.deepEqual(lookupRecords(scope,'只看屁股上的',now).map(match=>match.entry.id),['butt'])
})
test('护士解读不进入事实搜索，否定与未知时间仍单独标记', () => {
 const rows=[row('no','没有红疹','2026-10-01T10:00:00Z'),row('unknown','脸上红疹','2026-09-01T10:00:00Z',{timePrecision:'unknown'}),row('note','皮肤正常','2026-10-03T10:00:00Z',{aiNurse:{professionalNotes:[{heading:'红疹',text:'仅护士说明'}]} as JournalEntry['aiNurse']})]
 const found=lookupRecords(rows,'红疹',now)
 assert.deepEqual(found.map(match=>[match.entry.id,match.related]),[['no',true],['unknown',true]])
})
test('最早、某次变化和新食物继续走已有证据规则', () => {
 const rows=[row('a','脸颊红疹','2026-10-01T10:00:00Z',{eventId:'face'}),row('b','比昨天好转','2026-10-02T10:00:00Z',{eventId:'face'}),row('c','腿上红疹','2026-10-03T10:00:00Z',{eventId:'leg'})]
 assert.equal(lookupRecords(rows,'最早红疹',now)[0].entry.id,'a')
 assert.deepEqual(lookupRecords(rows,'脸颊红疹后来有什么变化',now).map(match=>match.entry.id),['b','a'])
 assert.equal(lookupRecords(rows,'上周最早红疹',now)[0].entry.id,'a')
})
test('切换排序按发生时间稳定排序，未知时间始终置后且不修改原结果', () => {
 const rows=[row('a','红疹','2026-10-01T10:00:00Z'),row('b','红疹','2026-10-03T10:00:00Z'),row('u','红疹','2026-08-01T10:00:00Z',{timePrecision:'unknown'})]
 const found=lookupRecords(rows,'红疹',now),ids=found.map(match=>match.entry.id)
 assert.deepEqual(orderLookupMatches(found,'earliest').map(match=>match.entry.id),['a','b','u'])
 assert.deepEqual(orderLookupMatches(found,'recent').map(match=>match.entry.id),['b','a','u'])
 assert.deepEqual(found.map(match=>match.entry.id),ids)
})


test('quick lookup shares journal sleep aliases for ordinary and earliest queries', () => {
  const sleeping = { ...row('sleep', '午间休息一小时', '2026-09-10T13:00:00'), categories: ['sleep'] as const }
  assert.deepEqual(lookupRecords([sleeping], '睡觉').map(match => match.entry.id), ['sleep'])
  assert.deepEqual(lookupRecords([sleeping], '最早睡觉').map(match => match.entry.id), ['sleep'])
})
