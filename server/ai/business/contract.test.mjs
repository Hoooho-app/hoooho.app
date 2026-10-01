import test from 'node:test'
import assert from 'node:assert/strict'
import { validateExtraction, buildJournal, mergeItems, resolveItemTime } from './contract.mjs'

const source = { id: 'text-1', page: 1, text: '昨晚没有呕吐，只是恶心。不是左腿，是右腿。' }
const item = { category: 'symptom', title: '观察记录', timeText: '昨晚', fields: [{ name: 'symptom', value: '没有呕吐，只是恶心', sourceId: source.id, page: 1, quote: '没有呕吐，只是恶心' }], archiveCategory: null, subject: 'current', relationKey: null }
test('字段来源逐项校验，拒绝虚构数字、模型指定身份和跨主体', () => {
  assert.equal(validateExtraction({ items: [item] }, [source]).length, 1)
  assert.throws(() => validateExtraction({ items: [{ ...item, accountId: 'other' }] }, [source]))
  assert.throws(() => validateExtraction({ items: [{ ...item, fields: [{ ...item.fields[0], value: '发热39℃' }] }] }, [source]))
  assert.equal(validateExtraction({ items: [{ ...item, subject: 'other' }] }, [source]).length, 0)
})
test('相对日期锁定输入时刻，未知时间不等于今天，未来拒绝', () => {
  const now = new Date('2026-09-30T10:00:00Z')
  const time = resolveItemTime(item, { timezone: 'Asia/Shanghai', referenceNow: now })
  assert.match(time.resolvedStart, /^2026-09-29/)
  assert.equal(resolveItemTime({ ...item, timeText: null }, { referenceNow: now }).precision, 'unknown')
  assert.throws(() => resolveItemTime({ ...item, timeText: '2027-01-01' }, { referenceNow: now }))
})
test('不同日期和不同剂量不删除；完全重复保留所有来源，冲突并列', () => {
  const first = { ...item, id: 'one', occurredAt: '2026-09-29T00:00:00Z' }
  const exact = { ...first, id: 'two', fields: first.fields.map(field => ({ ...field, sourceId: 'text-2' })) }
  const groups = mergeItems([first, exact, { ...first, id: 'three', occurredAt: '2026-09-28T00:00:00Z' }])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].fields[0].sources.length, 2)
})
test('睡眠时长由程序计算，未知质量不补正常，定位器不猜未知编号', () => {
  const sleep = buildJournal({ ...item, category: 'sleep', fields: [{ name: 'sleepAt', value: '2026-09-29T14:00:00Z' }, { name: 'wakeAt', value: '2026-09-29T22:00:00Z' },{name:'sleepKind',value:'夜间'}] })
  assert.equal(sleep.sleep.durationMinutes, 480)
  assert.equal(sleep.sleep.quality, undefined)
  assert.deepEqual(buildJournal(item).symptom.locations, [])
  assert.equal(buildJournal({...item,category:'sleep',fields:[{name:'sleepAt',value:'2026-09-29T14:00:00Z'},{name:'wakeAt',value:'2026-09-29T22:00:00Z'}]}).sleep,undefined)
  assert.deepEqual(buildJournal({...item,category:'elimination',fields:[{name:'bowelPain',value:'没有肚子痛'}]}).bowel.observations,[])
  assert.equal(buildJournal({...item,category:'visit',fields:[{name:'institution',value:'测试机构'}]}).visit.institutionName,'测试机构')
})
