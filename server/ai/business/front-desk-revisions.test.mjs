import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileFrontDeskRevisions } from './front-desk-revisions.mjs'

const source = (id, text) => ({ id, page: 1, text, status: 'readable' })
const ref = (id, quote) => ({ sourceId: id, page: 1, quote })
const field = (name, value, id, quote = value) => ({ name, value, sources: [ref(id, quote)], confirmed: false })
const fact = (id, text, extra = {}) => ({ id, text, status: 'active', sources: [{ messageId: `message-${id}`, quote: text }], ...extra })
const correction = (text, extra = {}) => ({ id: 'change-2', type: 'correct', targetId: 'fact-1', text, ...extra })
const replacement = (text, extra = {}) => fact('fact-2', text, { replaces: 'fact-1', changeId: 'change-2', ...extra })
const previous = (extra = {}) => ({ id: 'old-item', category: 'symptom', title: '咳嗽', timeText: '今天', timeSources: [ref('fact-1', '今天')], fields: [field('symptom', '咳嗽', 'fact-1'), field('location', '喉咙', 'fact-1')], ...extra })

test('literal time correction preserves independently unchanged symptoms and source', () => {
  const input = { items: [], previousItems: [previous()], changes: [correction('不是今天，是昨晚')], facts: [fact('fact-1', '今天喉咙咳嗽', { status: 'superseded' }), replacement('不是今天，是昨晚')], sources: [source('fact-2', '不是今天，是昨晚')], previousSources: [source('fact-1', '今天喉咙咳嗽')] }
  const original = structuredClone(input), result = reconcileFrontDeskRevisions(input)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].timeText, '昨晚')
  assert.deepEqual(result.items[0].fields.map(f => f.value), ['咳嗽', '喉咙'])
  assert.deepEqual(result.items[0].timeSources, [ref('fact-2', '昨晚')])
  assert.deepEqual(result.sources.map(s => s.id), ['fact-1', 'fact-2'])
  assert.deepEqual(input, original)
})

test('38 to 39 replaces just the measurement field and its old citation', () => {
  const result = reconcileFrontDeskRevisions({
    previousItems: [previous({ category: 'measurement', fields: [field('result', '38', 'fact-1'), field('unit', '℃', 'fact-1')] })],
    items: [{ id: 'new-item', category: 'measurement', timeText: null, fields: [field('result', '39', 'fact-2')] }],
    changes: [correction('不是38，是39')], facts: [fact('fact-1', '今天38℃', { status: 'superseded' }), replacement('不是38，是39')],
    sources: [source('fact-2', '不是38，是39')], previousSources: [source('fact-1', '今天38℃')]
  })
  assert.equal(result.items.length, 1)
  assert.deepEqual(result.items[0].fields.map(f => [f.name, f.value]), [['unit', '℃'], ['result', '39']])
  assert.equal(result.items[0].timeText, '今天')
  assert.equal(result.items[0].fields.find(f => f.name === 'result').sources[0].sourceId, 'fact-2')
})

test('new clinical symptom replaces old symptom and clears derived stale data', () => {
  const result = reconcileFrontDeskRevisions({
    previousItems: [previous({ journal: { symptom: { narrative: '咳嗽' } }, professionalSummary: { text: '咳嗽' }, time: { resolvedStart: '2026-10-26' } })],
    items: [{ id: 'new-item', category: 'symptom', timeText: null, fields: [field('symptom', '喷嚏', 'fact-2')] }],
    changes: [correction('不是咳嗽，是喷嚏')], facts: [fact('fact-1', '今天喉咙咳嗽', { status: 'superseded' }), replacement('不是咳嗽，是喷嚏')],
    sources: [source('fact-2', '不是咳嗽，是喷嚏')], previousSources: [source('fact-1', '今天喉咙咳嗽')]
  })
  const item = result.items[0]
  assert.equal(item.fields.filter(f => f.name === 'symptom').length, 1)
  assert.equal(item.fields.find(f => f.name === 'symptom').value, '喷嚏')
  assert.ok(!item.title.includes('咳嗽'))
  assert.equal(item.journal, undefined)
  assert.equal(item.professionalSummary, undefined)
  assert.equal(item.time, undefined)
})

test('retract removes only withdrawn fields; complete withdrawal removes item and old sources', () => {
  const data = { previousItems: [previous({ timeText: null, timeSources: [], fields: [field('symptom', '咳嗽', 'fact-1'), field('handling', '喝水', 'fact-extra')] })], items: [], changes: [{ id: 'withdraw', type: 'retract', targetId: 'fact-1', text: '' }], facts: [fact('fact-1', '咳嗽', { status: 'retracted' }), fact('fact-extra', '喝水')], sources: [], previousSources: [source('fact-1', '咳嗽'), source('fact-extra', '喝水')] }
  const result = reconcileFrontDeskRevisions(data)
  assert.deepEqual(result.items[0].fields.map(f => f.value), ['喝水'])
  assert.deepEqual(result.sources.map(s => s.id), ['fact-extra'])
  const all = reconcileFrontDeskRevisions({ ...data, changes: [...data.changes, { id: 'withdraw-extra', type: 'retract', targetId: 'fact-extra' }] })
  assert.deepEqual(all.items, [])
  assert.deepEqual(all.sources, [])
})

test('one field with two independent sources retains the nonwithdrawn source', () => {
  const result = reconcileFrontDeskRevisions({ previousItems: [previous({ timeText: null, timeSources: [], fields: [{ ...field('symptom', '咳嗽', 'fact-1'), sources: [ref('fact-1', '咳嗽'), ref('fact-extra', '咳嗽')] }] })], changes: [{ type: 'retract', targetId: 'fact-1' }], facts: [fact('fact-1', '咳嗽'), fact('fact-extra', '咳嗽')], previousSources: [source('fact-1', '咳嗽'), source('fact-extra', '咳嗽')] })
  assert.deepEqual(result.items[0].fields[0].sources, [ref('fact-extra', '咳嗽')])
})

test('ambiguous target is unassigned instead of merging into either old item', () => {
  const result = reconcileFrontDeskRevisions({ previousItems: [previous(), previous({ id: 'second' })], items: [{ id: 'fresh', category: 'symptom', fields: [field('symptom', '喷嚏', 'fact-2')] }], changes: [correction('喷嚏')], facts: [fact('fact-1', '今天喉咙咳嗽'), replacement('喷嚏')], sources: [source('fact-2', '喷嚏')], previousSources: [source('fact-1', '今天喉咙咳嗽')] })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].needsReview, true)
  assert.equal(result.items[0].unassigned, true)
  assert.equal(result.items[0].subjectConfirmed, false)
  assert.equal(result.items[0].fields.length, 1)
  assert.deepEqual(result.sources.map(s => s.id), ['fact-2'])
})

test('a shared message ID without the same fact quote cannot select an old item', () => {
  const result = reconcileFrontDeskRevisions({ previousItems: [previous({ timeText: null, timeSources: [], fields: [field('symptom', '咳嗽', 'message-shared')] })], items: [{ id: 'fresh', category: 'symptom', fields: [field('symptom', '喷嚏', 'fact-2')] }], changes: [correction('喷嚏')], facts: [fact('fact-1', '肚子疼', { sourceMessageId: 'message-shared' }), replacement('喷嚏')], sources: [source('fact-2', '喷嚏')], previousSources: [source('message-shared', '咳嗽，肚子疼')] })
  assert.equal(result.items[0].needsReview, true)
  assert.deepEqual(result.items[0].fields.map(f => f.value), ['喷嚏'])
})

test('saved facts are immutable and attempted replacement remains review-only', () => {
  const old = fact('fact-1', '今天喉咙咳嗽', { saved: true, recordId: 'record-1' }), snapshot = structuredClone(old)
  const result = reconcileFrontDeskRevisions({ previousItems: [previous()], items: [{ id: 'new', category: 'symptom', fields: [field('symptom', '喷嚏', 'fact-2')] }], changes: [correction('喷嚏')], facts: [old, replacement('喷嚏')], sources: [source('fact-2', '喷嚏')], previousSources: [source('fact-1', '今天喉咙咳嗽')] })
  assert.deepEqual(old, snapshot)
  assert.equal(result.items[0].revisionIssue, 'saved_fact_is_immutable')
  assert.equal(result.items[0].recordId, undefined)
  assert.deepEqual(result.items[0].fields.map(f => f.value), ['喷嚏'])
})

test('subject-only correction retains fields but cannot confirm an unknown person', () => {
  const result = reconcileFrontDeskRevisions({ previousItems: [previous()], changes: [correction('是哥哥')], facts: [fact('fact-1', '今天喉咙咳嗽'), replacement('是哥哥', { subject: { kind: 'other', memberId: null, label: '哥哥', sources: [{ messageId: 'message-fact-2', quote: '是哥哥' }], confirmed: false } })], sources: [source('fact-2', '是哥哥')], previousSources: [source('fact-1', '今天喉咙咳嗽')] })
  assert.deepEqual(result.items[0].fields.map(f => f.value), ['咳嗽', '喉咙'])
  assert.equal(result.items[0].needsReview, true)
  assert.equal(result.items[0].subjectResolution.label, '哥哥')
})

test('unknown replacement never restores an old affirmative symptom', () => {
  const result = reconcileFrontDeskRevisions({ previousItems: [previous()], items: [{ id: 'new', category: 'symptom', fields: [field('symptom', '没注意是否咳嗽', 'fact-2')] }], changes: [correction('没注意是否咳嗽')], facts: [fact('fact-1', '今天喉咙咳嗽'), replacement('没注意是否咳嗽', { polarity: 'unknown' })], sources: [source('fact-2', '没注意是否咳嗽')], previousSources: [source('fact-1', '今天喉咙咳嗽')] })
  assert.equal(result.items[0].needsReview, true)
  assert.deepEqual(result.items[0].fields.filter(f => f.name === 'symptom').map(f => f.value), ['没注意是否咳嗽'])
})

test('fresh extraction time carries a literal time citation derived from the same source', () => {
  const result = reconcileFrontDeskRevisions({ previousItems: [previous()], items: [{ id: 'new', category: 'symptom', timeText: '昨晚', fields: [field('symptom', '喷嚏', 'fact-2', '昨晚喷嚏')] }], changes: [correction('昨晚喷嚏')], facts: [fact('fact-1', '今天喉咙咳嗽'), replacement('昨晚喷嚏')], sources: [source('fact-2', '昨晚喷嚏')], previousSources: [source('fact-1', '今天喉咙咳嗽')] })
  assert.equal(result.items[0].timeText, '昨晚')
  assert.deepEqual(result.items[0].timeSources, [ref('fact-2', '昨晚')])
})

test('unrelated previous candidates and unreferenced old sources are not re-extracted or revived', () => {
  const fresh = { id: 'new', category: 'symptom', fields: [field('symptom', '喷嚏', 'fact-2')] }
  const result = reconcileFrontDeskRevisions({ previousItems: [previous()], items: [fresh], facts: [fact('fact-1', '今天喉咙咳嗽'), replacement('喷嚏')], sources: [source('fact-2', '喷嚏')], previousSources: [source('fact-1', '今天喉咙咳嗽')] })
  assert.deepEqual(result.items[0].fields, fresh.fields)
  assert.deepEqual(result.sources.map(s => s.id), ['fact-2'])
})

test('independent corrections in one item compose without restoring an earlier value', () => {
  const result = reconcileFrontDeskRevisions({
    previousItems: [previous({ category: 'measurement', fields: [field('result', '38', 'fact-temperature'), field('unit', '℃', 'fact-temperature')], timeSources: [ref('fact-time', '今天')] })],
    items: [{ id: 'temperature', category: 'measurement', fields: [field('result', '39', 'new-temperature')] }],
    changes: [{ id: 'temperature-change', type: 'correct', targetId: 'fact-temperature', text: '不是38，是39' }, { id: 'time-change', type: 'correct', targetId: 'fact-time', text: '不是今天，是昨晚' }],
    facts: [fact('fact-temperature', '38℃'), fact('fact-time', '今天'), fact('new-temperature', '不是38，是39', { replaces: 'fact-temperature', changeId: 'temperature-change' }), fact('new-time', '不是今天，是昨晚', { replaces: 'fact-time', changeId: 'time-change' })],
    sources: [source('new-temperature', '不是38，是39'), source('new-time', '不是今天，是昨晚')], previousSources: [source('fact-temperature', '38℃'), source('fact-time', '今天')]
  })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].fields.find(f => f.name === 'result').value, '39')
  assert.equal(result.items[0].timeText, '昨晚')
  assert.ok(!result.sources.some(s => s.id === 'fact-time'))
})

test('a missing old source cannot be used to revive an uncited clinical field', () => {
  const result = reconcileFrontDeskRevisions({ previousItems: [previous()], items: [{ id: 'fresh', category: 'symptom', fields: [field('symptom', '喷嚏', 'fact-2')] }], changes: [correction('喷嚏')], facts: [fact('fact-1', '今天喉咙咳嗽'), replacement('喷嚏')], sources: [source('fact-2', '喷嚏')], previousSources: [] })
  assert.deepEqual(result.items[0].fields.map(f => f.value), ['喷嚏'])
  assert.equal(result.items[0].timeText, null)
})
