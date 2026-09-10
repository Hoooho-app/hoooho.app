import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateGrowthPosition, exactAgeInMonths, heightMeasureLabel, WHO_CHILD_GROWTH_STANDARD } from './childGrowthReference.ts'

test('23个月与24个月准确切换身长和身高', () => {
  assert.equal(heightMeasureLabel('2024-01-15', '2025-12-14'), '身长')
  assert.equal(heightMeasureLabel('2024-01-15', '2026-01-15'), '身高')
  assert.ok((exactAgeInMonths('2024-01-15', '2025-12-30') ?? 0) > 23)
})

test('WHO 2006 LMS 按性别和精确月龄生成不同且非固定的百分位', () => {
  const girl = calculateGrowthPosition({ birthday: '2024-01-15', gender: 'female', measuredAt: '2025-10-28', measure: 'height', value: 82 })
  const boy = calculateGrowthPosition({ birthday: '2024-01-15', gender: 'male', measuredAt: '2025-10-28', measure: 'height', value: 82 })
  const heavier = calculateGrowthPosition({ birthday: '2024-01-15', gender: 'female', measuredAt: '2025-10-28', measure: 'weight', value: 13 })
  assert.equal(WHO_CHILD_GROWTH_STANDARD.version, '2006')
  assert.ok(girl && boy && heavier)
  assert.notEqual(girl.percentileLabel, 'P45')
  assert.notEqual(girl.percentile, boy.percentile)
  assert.ok(heavier.percentile > 50)
})

test('缺少出生日期、性别或超出0至60月适用范围时不生成百分位', () => {
  assert.equal(calculateGrowthPosition({ gender: 'female', measuredAt: '2026-01-15', measure: 'height', value: 82 }), null)
  assert.equal(calculateGrowthPosition({ birthday: '2024-01-15', gender: 'undisclosed', measuredAt: '2026-01-15', measure: 'height', value: 82 }), null)
  assert.equal(calculateGrowthPosition({ birthday: '2018-01-15', gender: 'female', measuredAt: '2026-01-15', measure: 'height', value: 120 }), null)
})
