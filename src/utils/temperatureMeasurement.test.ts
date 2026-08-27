import assert from 'node:assert/strict'
import test from 'node:test'
import { getExactTemperatureMeasurement } from './temperatureMeasurement.ts'

test('单次精确体温可进入趋势图，范围和无效值不会被伪造成中点', () => {
  assert.equal(getExactTemperatureMeasurement(38.5, 38.5), 38.5)
  assert.equal(getExactTemperatureMeasurement(35, 36.9), null)
  assert.equal(getExactTemperatureMeasurement(Number.NaN, 38.5), null)
})
