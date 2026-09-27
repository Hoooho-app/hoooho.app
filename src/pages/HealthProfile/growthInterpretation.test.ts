import assert from 'node:assert/strict'
import test from 'node:test'
import type { GrowthMeasurementApiDto, Member } from '../../types/index.ts'
import { buildGrowthInterpretation, metricRecords } from './growthInterpretation.ts'

const member: Member = { id: 'm1', name: '小禾', relation: '子女', age: '', birthday: '2024-01-15', gender: 'female' }
const record = (id: string, measuredAt: string, heightCm: number | null, weightKg: number | null): GrowthMeasurementApiDto => ({ id, accountId: 'a1', memberId: 'm1', measuredAt, measurementType: 'height', heightCm, weightKg, dataStatus: 'confirmed', standardId: 'who-2006', createdAt: `${measuredAt}T01:00:00Z`, updatedAt: `${measuredAt}T01:00:00Z` })

test('解读按指标分别选择有效记录并计算可追溯差值', () => {
  const records = [record('3', '2026-09-27', 84, 10.7), record('2', '2026-09-14', 82.6, null), record('1', '2026-09-11', null, 11)]
  assert.deepEqual(metricRecords(records, 'height').map((item) => item.id), ['2', '3'])
  assert.deepEqual(metricRecords(records, 'weight').map((item) => item.id), ['1', '3'])
  const height = buildGrowthInterpretation({ member, measure: 'height', records, position: null })
  assert.match(height.comparison, /13 天前.*增加 1\.4 cm/)
  const weight = buildGrowthInterpretation({ member, measure: 'weight', records, position: null })
  assert.match(weight.comparison, /16 天前.*减少 0\.3 kg/)
  assert.match(weight.next, /核对单位、秤和称重条件/)
})

test('单条和空记录不输出虚假趋势或百分位', () => {
  const single = buildGrowthInterpretation({ member, measure: 'height', records: [record('1', '2026-09-27', 84, null)], position: null })
  assert.match(single.comparison, /第一条有效身高记录/)
  assert.match(single.observation, /不能判断长期变化/)
  const empty = buildGrowthInterpretation({ member, measure: 'weight', records: [], position: null })
  assert.match(empty.observation, /不能判断位置或趋势/)
  assert.doesNotMatch(empty.latest, /P\d+/)
})
