import test from 'node:test'
import assert from 'node:assert/strict'
import { handoffDraft, type HandoffData } from './handoffModel.ts'
test('fixed schedules include medication and topical while caution remains separate', () => {
  const d: HandoffData = { fingerprint: 'hash', asOf: '2026-10-17', member: { name: '安安' }, sections: [{ id: 'routine', title: '', empty: '', rows: [{ title: '午睡', detail: '12:30—14:00', source: '家长已设置的日常安排' }] }, { id: 'medication', title: '', empty: '', rows: [{ title: '药品', detail: '08:00', source: '家长已设置的用药安排' }, { title: '医嘱', detail: '原文', source: '已录入医嘱原文' }] }, { id: 'attention', title: '', empty: '', rows: [{ title: '外用', detail: '20:00', source: '家长已设置的每天照护' }] }, { id: 'vaccination', title: '', empty: '', rows: [{ title: '下一针', detail: '', source: '' }] }] }
  const draft = handoffDraft(d); assert.deepEqual(draft.routines.map(r => r.title), ['午睡', '药品', '外用']); assert.deepEqual(draft.cautions.map(r => r.title), ['医嘱']); assert.equal(draft.parentNote, '')
  d.handoffDraft = { routines: [], cautions: [], parentNote: '本次交代' }; assert.equal(handoffDraft(d).parentNote, '本次交代')
})

test('time-first schedule sorts meals, supplements, multiple doses and overnight sleep without changing sources', async () => {
  const { handoffSchedule } = await import('./handoffModel.ts')
  const rows = [{ title: '夜间睡眠', detail: '21:00—07:00 · 北京时间', source: '设置' }, { title: 'AD', detail: '08:15 · 1粒 · 北京时间', source: '设置' }, { title: '药甲', detail: '每次 2.5ml · 口服 · 08:00、20:00 · 北京时间', source: '用药安排' }, { title: '午餐', detail: '12:00', source: '' }, { title: '早餐', detail: '07:30—08:00', source: '' }, { title: '20:30 保湿', detail: '保湿霜', source: '' }, { title: '散步', detail: '看天气', source: '' }]
  const before = JSON.stringify(rows), result = handoffSchedule(rows)
  assert.deepEqual(result.map(r => r.time), ['07:30—08:00', '08:00', '08:15', '12:00', '20:00', '20:30', '21:00—次日07:00', '时间未定'])
  assert.equal(result[1].description, '药甲 · 每次 2.5ml · 口服')
  assert.equal(result[6].description, '夜间睡眠')
  assert.equal(JSON.stringify(rows), before)
})
test('interval medication stays an interval, never invented daily doses', async () => {
  const { handoffSchedule } = await import('./handoffModel.ts')
  const result = handoffSchedule([{ title: '药乙', detail: '每8小时，从08:00开始 · 每次1ml · 北京时间', source: '用药安排' }])
  assert.equal(result.length, 1); assert.equal(result[0].time, '每8小时'); assert.match(result[0].description, /从08:00开始/)
})

test('explanatory times never become doses or lose their meaning', async () => {
  const { handoffSchedule } = await import('./handoffModel.ts')
  const result = handoffSchedule([{ title: '药甲', detail: '08:00 · 每次1ml，12:00前不要重复服用', source: '' }, { title: '早餐', detail: '08:00 · 午睡12:30—14:00前少量', source: '' }, { title: '药乙', detail: '08:00吃药，20:00不要再吃', source: '' }])
  assert.equal(result.length, 3)
  assert.equal(result[0].time, '08:00'); assert.match(result[0].description, /12:00前不要重复服用/)
  assert.equal(result[1].time, '08:00'); assert.match(result[1].description, /12:30—14:00前少量/)
  assert.equal(result[2].time, '时间见说明'); assert.match(result[2].description, /08:00吃药，20:00不要再吃/)
})

test('edited single-digit clock fields normalize without changing their description', async () => {
  const { handoffSchedule } = await import('./handoffModel.ts')
  const result = handoffSchedule([{ title: '早餐', detail: '8:00—8:30', source: '' }, { title: 'AD', detail: '8:45 · 1粒', source: '' }])
  assert.deepEqual(result.map(row => row.time), ['08:00—08:30', '08:45'])
})
