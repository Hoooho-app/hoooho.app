import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMonotoneCurve,
  classifyAxillaryTemperature,
  classifyTemperatureForSite,
  getTemperatureDomain,
  isValidTemperature,
  sampleCubicSegment
} from './temperatureTrend.ts'

test('腋温边界值按集中阈值准确分级', () => {
  const cases = [
    [34.9, 'marked-low'], [35, 'low'], [35.9, 'low'], [36, 'normal'],
    [37.2, 'normal'], [37.3, 'low-fever'], [38, 'low-fever'], [38.1, 'moderate-fever'],
    [39, 'moderate-fever'], [39.1, 'high-fever'], [41, 'high-fever'], [41.1, 'hyperpyrexia']
  ] as const
  for (const [value, expected] of cases) assert.equal(classifyAxillaryTemperature(value).level, expected)
})

test('非腋温数据不会套用腋温异常分级', () => {
  assert.equal(classifyTemperatureForSite(38.5, '耳温').level, 'site-specific')
  assert.equal(classifyTemperatureForSite(38.5, '腋下').level, 'moderate-fever')
})

test('一个点不生成虚假曲线，两个点与多个点均不产生过冲', () => {
  assert.equal(buildMonotoneCurve([{ x: 10, y: 40 }]).path, '')

  const pointSets = [
    [{ x: 0, y: 30 }, { x: 100, y: 80 }],
    [{ x: 0, y: 60 }, { x: 50, y: 20 }, { x: 100, y: 70 }, { x: 150, y: 45 }]
  ]
  for (const points of pointSets) {
    const curve = buildMonotoneCurve(points)
    assert.ok(curve.path.startsWith('M '))
    for (const segment of curve.segments) {
      const lower = Math.min(segment.start.y, segment.end.y)
      const upper = Math.max(segment.start.y, segment.end.y)
      for (let step = 0; step <= 100; step += 1) {
        const sample = sampleCubicSegment(segment, step / 100)
        assert.ok(sample.y >= lower - 1e-8 && sample.y <= upper + 1e-8)
      }
    }
  }
})

test('Y 轴包含正常参考带且不会夸大小幅波动', () => {
  const domain = getTemperatureDomain([36.7, 36.8])
  assert.ok(domain.min <= 36)
  assert.ok(domain.max >= 37.2)
  assert.ok(domain.max - domain.min >= 4)
})

test('无效或缺失体温可被安全过滤', () => {
  assert.equal(isValidTemperature(undefined), false)
  assert.equal(isValidTemperature(Number.NaN), false)
  assert.equal(isValidTemperature(Number.POSITIVE_INFINITY), false)
  assert.equal(isValidTemperature(38.5), true)
})
