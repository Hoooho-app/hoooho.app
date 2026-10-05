import assert from 'node:assert/strict'
import test from 'node:test'
import type { GrowthMeasurementApiDto } from '../../../types'
import { resolveCurrentGrowthMeasurements, resolveCurrentGrowthSnapshot } from './resolveCurrentGrowthMeasurements'

function measurement(overrides: Partial<GrowthMeasurementApiDto>): GrowthMeasurementApiDto {
  return {
    id: 'growth-1',
    accountId: 'account-1',
    memberId: 'member-1',
    measuredAt: '2026-09-01',
    measurementType: 'height',
    heightCm: null,
    weightKg: null,
    dataStatus: 'confirmed',
    standardId: 'who-2006',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  }
}

test('分别读取当前人物最新有效身高和体重', () => {
  const result = resolveCurrentGrowthMeasurements({}, [
    measurement({ id: 'weight', measuredAt: '2026-08-20', weightKg: 10.7 }),
    measurement({ id: 'height', measuredAt: '2026-09-20', heightCm: 84.2 }),
    measurement({ id: 'other', memberId: 'member-2', measuredAt: '2026-09-25', heightCm: 199, weightKg: 99 }),
  ], 'member-1')

  assert.deepEqual(result, { heightCm: 84.2, weightKg: 10.7 })
})

test('有已确认记录时不让待确认记录覆盖摘要', () => {
  const result = resolveCurrentGrowthMeasurements({ heightCm: 80, weightKg: 9 }, [
    measurement({ id: 'confirmed', measuredAt: '2026-09-10', heightCm: 84, weightKg: 10.5 }),
    measurement({ id: 'pending', measuredAt: '2026-09-20', heightCm: 120, weightKg: 25, dataStatus: 'pending_confirmation' }),
  ], 'member-1')

  assert.deepEqual(result, { heightCm: 84, weightKg: 10.5 })
})

test('没有对应记录时保留人物资料中的现有值', () => {
  const result = resolveCurrentGrowthMeasurements({ heightCm: 83.5, weightKg: 10.2 }, [], 'member-1')
  assert.deepEqual(result, { heightCm: 83.5, weightKg: 10.2 })
})

test('摘要日期分别来自身高与体重对应有效记录；旧资料值不伪造日期', () => {
  assert.deepEqual(resolveCurrentGrowthSnapshot({}, [
    measurement({ id: 'height', measuredAt: '2026-09-28', heightCm: 84.1 }),
    measurement({ id: 'weight', measuredAt: '2026-09-27', weightKg: 10.7 }),
    measurement({ id: 'unconfirmed', measuredAt: '2026-09-29', heightCm: 99, dataStatus: 'pending_confirmation' }),
  ], 'member-1'), { heightCm: 84.1, weightKg: 10.7, heightMeasuredAt: '2026-09-28', weightMeasuredAt: '2026-09-27' })
  assert.deepEqual(resolveCurrentGrowthSnapshot({ heightCm: 80 }, [], 'member-1'), { heightCm: 80, weightKg: null, heightMeasuredAt: null, weightMeasuredAt: null })
})
