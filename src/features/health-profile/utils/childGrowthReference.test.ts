import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateGrowthPosition, exactAgeInMonths, growthReferenceMessage, growthValueAtZScore, heightMeasureLabel, interpolateGrowthLms, WHO_CHILD_GROWTH_STANDARD } from './childGrowthReference.ts'
import { CDC_MALE_STATURE_FOR_AGE, CDC_FEMALE_STATURE_FOR_AGE, CDC_MALE_WEIGHT_FOR_AGE, CDC_FEMALE_WEIGHT_FOR_AGE } from './cdcGrowthReferenceData.ts'

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

test('极端百分位不会被描述成常见参考区间', () => {
  assert.match(growthReferenceMessage(-3), /超出主要参考区间/)
  assert.match(growthReferenceMessage(3), /超出主要参考区间/)
  assert.doesNotMatch(growthReferenceMessage(-3), /常见参考区间/)
  assert.equal(growthReferenceMessage(0), '参考区间中部')
})

test('WHO P50 参考值使用对应性别、指标和测量月龄的中位数', () => {
  assert.equal(growthValueAtZScore({ ageInMonths: 12, gender: 'female', measure: 'height', zScore: 0 }), 74.015)
  assert.equal(growthValueAtZScore({ ageInMonths: 12, gender: 'male', measure: 'height', zScore: 0 }), 75.7488)
  assert.equal(growthValueAtZScore({ ageInMonths: 12, gender: 'female', measure: 'weight', zScore: 0 }), 8.9481)
  assert.equal(growthValueAtZScore({ ageInMonths: 12.5, gender: 'female', measure: 'height', zScore: 0 }), (74.015 + 75.2176) / 2)
  assert.equal(growthValueAtZScore({ ageInMonths: 61, gender: 'female', measure: 'height', zScore: 0 }), null)
  assert.equal(growthValueAtZScore({ ageInMonths: 12, gender: 'undisclosed', measure: 'weight', zScore: 0 }), null)
})

test('CDC 官方24月LMS保留厘米与千克中位数，男女各218个点', () => {
  for (const points of [CDC_MALE_STATURE_FOR_AGE, CDC_FEMALE_STATURE_FOR_AGE, CDC_MALE_WEIGHT_FOR_AGE, CDC_FEMALE_WEIGHT_FOR_AGE]) {
    assert.equal(points.length, 218)
    assert.equal(points[0][0], 24)
    assert.equal(points.at(-1)?.[0], 240)
  }
  assert.equal(growthValueAtZScore({ referenceId: 'cdc-2000', ageInMonths: 24, gender: 'male', measure: 'height', zScore: 0 }), 86.45220101)
  assert.equal(growthValueAtZScore({ referenceId: 'cdc-2000', ageInMonths: 24, gender: 'male', measure: 'weight', zScore: 0 }), 12.6707633)
})

test('CDC半月网格插值按实际间距计算，不把24.5月误作24月', () => {
  assert.deepEqual(interpolateGrowthLms(CDC_MALE_STATURE_FOR_AGE, 24.5), CDC_MALE_STATURE_FOR_AGE[1])
  const quarter = interpolateGrowthLms(CDC_MALE_STATURE_FOR_AGE, 24.25)
  assert.ok(quarter)
  assert.equal(quarter[2], (86.45220101 + 86.86160934) / 2)
  const integer = interpolateGrowthLms(CDC_MALE_STATURE_FOR_AGE, 25)
  assert.ok(integer)
  assert.equal(integer[2], (86.86160934 + 87.65247282) / 2)
})

test('CDC算出的P3与官方公布数值一致，同一测量切换参考不改数据', () => {
  const officialP3 = growthValueAtZScore({ referenceId: 'cdc-2000', ageInMonths: 24, gender: 'male', measure: 'height', zScore: -1.8807936081512509 })
  assert.ok(officialP3 && Math.abs(officialP3 - 79.91084447) < .00001)
  const input = { birthday: '2024-01-15', measuredAt: '2026-01-15', gender: 'male' as const, measure: 'height' as const, value: 86.45220101 }
  const cdc = calculateGrowthPosition({ ...input, referenceId: 'cdc-2000' })
  const who = calculateGrowthPosition(input)
  assert.ok(cdc && who)
  assert.ok(Math.abs(cdc.percentile - 50) < .0001)
  assert.notEqual(cdc.percentile, who.percentile)
  assert.equal(input.value, 86.45220101)
})

test('CDC严守2–20岁范围，不外推也不制造缺失资料百分位', () => {
  for (const ageInMonths of [23.99, 240.01, NaN, Infinity]) assert.equal(growthValueAtZScore({ referenceId: 'cdc-2000', ageInMonths, gender: 'female', measure: 'weight', zScore: 0 }), null)
  for (const measuredAt of ['2025-12-14', '2044-01-16']) assert.equal(calculateGrowthPosition({ referenceId: 'cdc-2000', birthday: '2024-01-15', measuredAt, gender: 'female', measure: 'height', value: 90 }), null)
  assert.equal(calculateGrowthPosition({ referenceId: 'cdc-2000', birthday: '2024-01-15', measuredAt: '2026-01-15', gender: 'undisclosed', measure: 'height', value: 90 }), null)
})
