import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSleepDuration, normalizeLegacyProfile, saveCurrentProfile, shouldShowProfileField, sortProfileRecords } from './profileSectionExperience.ts'

test('sleep duration handles crossing midnight', () => {
  assert.equal(calculateSleepDuration('23:30', '07:00'), '7.5')
  assert.equal(calculateSleepDuration('22:00', '06:00'), '8')
})

test('conditional fields follow the selected parent state', () => {
  const field = { id: 'dailyAmount', label: '数量', kind: 'number', visibleWhen: { field: 'status', values: ['目前吸烟'] } } as const
  assert.equal(shouldShowProfileField(field, { status: '从不吸烟' }), false)
  assert.equal(shouldShowProfileField(field, { status: '目前吸烟' }), true)
})

test('pregnancy delivery fields only show for delivery result', () => {
  const field = { id: 'delivery', label: '分娩方式', kind: 'single', visibleWhen: { field: 'result', values: ['分娩'] } } as const
  assert.equal(shouldShowProfileField(field, { result: '自然流产' }), false)
  assert.equal(shouldShowProfileField(field, { result: '分娩' }), true)
})

test('non-repeatable profiles update the current snapshot without adding duplicates or deleting legacy history', () => {
  const next = saveCurrentProfile({ status: '目前吸烟' }, [{ status: '当前吸烟', legacy: 'kept' }, { status: '从不' }], 'now')
  assert.equal(next.length, 2)
  assert.equal(next[0].legacy, 'kept')
  assert.equal(next[0].status, '目前吸烟')
  assert.equal(next[1].status, '从不')
})

test('growth records sort by date without mutating the source', () => {
  const source = [{ date: '2026-03-12' }, { date: '2026-08-10' }]
  const sorted = sortProfileRecords(source)
  assert.deepEqual(sorted.map(({ date }) => date), ['2026-08-10', '2026-03-12'])
  assert.deepEqual(source.map(({ date }) => date), ['2026-03-12', '2026-08-10'])
})

test('legacy family history disease becomes a multi-condition value', () => {
  assert.deepEqual(normalizeLegacyProfile('family-history', { relationship: '父亲', disease: '高血压' }).conditions, ['高血压'])
})
