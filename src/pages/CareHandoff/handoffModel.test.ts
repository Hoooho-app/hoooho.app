import test from 'node:test'
import assert from 'node:assert/strict'
import { handoffDraft, type HandoffData } from './handoffModel.ts'
test('fixed schedules include medication and topical while caution remains separate', () => {
  const d: HandoffData = { fingerprint: 'hash', asOf: '2026-10-17', member: { name: '安安' }, sections: [{ id: 'routine', title: '', empty: '', rows: [{ title: '午睡', detail: '12:30—14:00', source: '家长已设置的日常安排' }] }, { id: 'medication', title: '', empty: '', rows: [{ title: '药品', detail: '08:00', source: '家长已设置的用药安排' }, { title: '医嘱', detail: '原文', source: '已录入医嘱原文' }] }, { id: 'attention', title: '', empty: '', rows: [{ title: '外用', detail: '20:00', source: '家长已设置的每天照护' }] }, { id: 'vaccination', title: '', empty: '', rows: [{ title: '下一针', detail: '', source: '' }] }] }
  const draft = handoffDraft(d); assert.deepEqual(draft.routines.map(r => r.title), ['午睡', '药品', '外用']); assert.deepEqual(draft.cautions.map(r => r.title), ['医嘱']); assert.equal(draft.parentNote, '')
  d.handoffDraft = { routines: [], cautions: [], parentNote: '本次交代' }; assert.equal(handoffDraft(d).parentNote, '本次交代')
})
