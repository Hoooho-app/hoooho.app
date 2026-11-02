import assert from 'node:assert/strict'
import test from 'node:test'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { growthRecordDateBounds } from './growthRecordDate'
import { buildGrowthInterpretation, metricRecords } from './growthInterpretation'
import { resolveCurrentGrowthSnapshot } from '../../features/health-profile/utils/resolveCurrentGrowthMeasurements'
import { generateSymptomSummary } from '../HealthEvents/symptomRecordLogic'

const member: Member = { id: 'fictional', name: '虚构', relation: '子女', age: '', birthday: '2024-01-01' }
const point = (id: string, dataStatus: 'confirmed' | 'pending_confirmation', heightCm: number): GrowthMeasurementApiDto => ({ id, accountId: 'a', memberId: member.id, measuredAt: id === 'old' ? '2026-10-01' : '2026-10-02', createdAt: '2026-11-01', updatedAt: '2026-11-01', measurementType: 'height', standardId: 'who-2006', heightCm, weightKg: null, dataStatus })

test('local today and birth bounds stay correct at Shanghai midnight and in western timezones', () => {
  const at = new Date('2026-11-02T00:30:00+08:00')
  assert.deepEqual(growthRecordDateBounds('2024-01-01', at, 'Asia/Shanghai'), { min: '2024-01-01', max: '2026-11-02' })
  assert.equal(growthRecordDateBounds(undefined, at, 'America/Los_Angeles').max, '2026-11-01')
  assert.equal(growthRecordDateBounds('2024', at, 'UTC').min, undefined)
})

test('pending data never becomes latest, differences or curve inputs, and pending-only is insufficient', () => {
  const records = [point('old', 'confirmed', 84), point('new', 'pending_confirmation', 120)]
  assert.deepEqual(metricRecords(records, 'height').map(item => item.id), ['old'])
  const text = JSON.stringify(buildGrowthInterpretation({ member, measure: 'height', records, position: null }))
  assert.ok(text.includes('84.0')); assert.ok(!text.includes('120.0')); assert.ok(!text.includes('36.0'))
  assert.equal(resolveCurrentGrowthSnapshot({}, [records[1]], member.id).heightCm, null)
  assert.match(buildGrowthInterpretation({ member, measure: 'height', records: [records[1]], position: null }).observation, /不能判断/)
})

test('deleted derived basics do not return through stale member cache while independent values survive', () => {
  assert.equal(resolveCurrentGrowthSnapshot({ heightCm: 84, growthBaseline: { heightCm: null, weightKg: null } }, [], member.id).heightCm, null)
  assert.equal(resolveCurrentGrowthSnapshot({ heightCm: 84, growthBaseline: { heightCm: 80, weightKg: 10 } }, [], member.id).heightCm, 80)
  assert.equal(resolveCurrentGrowthSnapshot({ heightCm: 80 }, [], member.id).heightCm, 80)
})

test('legacy invalid count is not repeated as a generated symptom statement; zero remains explicit', () => {
  const summary = (approximateCount: number) => generateSymptomSummary({ symptomCategory: 'gastrointestinal', locations: [], descriptors: ['腹泻'], symptomSpecificData: { approximateCount } })
  assert.doesNotMatch(summary(-3), /-3次/)
  assert.doesNotMatch(summary(1.5), /1.5次/)
  assert.match(summary(0), /0次/)
})
