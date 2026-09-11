import assert from 'node:assert/strict'
import test from 'node:test'
import { growthTrend, requiresMeasurementConfirmation } from './growthTrend.ts'

const point = (id: string, date: string, h: number, w: number, hz: number, wz: number, status: 'confirmed' | 'pending_confirmation' = 'confirmed') => ({ id, accountId: 'a', memberId: 'm', measuredAt: date, measurementType: 'height' as const, heightCm: h, weightKg: w, dataStatus: status, standardId: 'who-2006' as const, createdAt: date, updatedAt: date, heightPosition: { zScore: hz, percentile: 40, percentileLabel: 'P40', position: 40, referenceMessage: '', ageInMonths: 1 }, weightPosition: { zScore: wz, percentile: 40, percentileLabel: 'P40', position: 40, referenceMessage: '', ageInMonths: 1 } })
test('趋势只使用已确认记录，下降和稳定判断来自真实相邻点', () => {
  assert.equal(growthTrend([point('1','2026-01-01',70,8,0,0), point('2','2026-02-01',72,8.3,-.1,-.1)]).kind, 'stable')
  assert.equal(growthTrend([point('1','2026-01-01',70,8,0,0), point('2','2026-02-01',71,8.1,-.8,-.8)]).kind, 'attention')
  assert.equal(growthTrend([point('1','2026-01-01',70,8,0,0), point('2','2026-02-01',90,20,-2,-2,'pending_confirmation')]).kind, 'insufficient')
})
test('与上一条差异过大的新测量进入待确认，补录旧日期不误触发', () => {
  const previous = point('1','2026-01-01',70,8,0,0)
  assert.equal(requiresMeasurementConfirmation(previous, { measuredAt: '2026-01-15', heightCm: 90, weightKg: 8 }), true)
  assert.equal(requiresMeasurementConfirmation(previous, { measuredAt: '2025-12-01', heightCm: 60, weightKg: 7 }), false)
})
