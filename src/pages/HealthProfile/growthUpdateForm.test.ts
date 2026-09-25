import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWeightKg, gramsToKg, kgToGrams, stepHeightValue, stepWeightGramsValue, stepWeightKgValue, validWeightGrams, validWeightKg } from './growthUpdateForm.ts'

test('克与千克按1克精度可靠换算', () => {
  assert.equal(kgToGrams(11.001), '11001')
  assert.equal(gramsToKg('11001'), 11.001)
  assert.equal(validWeightGrams('11001'), true)
  assert.equal(validWeightGrams('11001.5'), false)
})

test('身高步进不低于进入页面时初始值，手动值不受该下限改写', () => {
  assert.equal(stepHeightValue('82.0', -1, 82), '82.0')
  assert.equal(stepHeightValue('82.1', -1, 82), '82.0')
  assert.equal(stepHeightValue('81.5', -1, 82), '81.5')
  assert.equal(stepHeightValue('82.0', 1, 82), '82.1')
})

test('体重步进每次1克且允许下降', () => {
  assert.equal(stepWeightGramsValue('11001', -1), '11000')
  assert.equal(stepWeightGramsValue('11000', 1), '11001')
})

test('千克表达仍按0.001 kg步进并保留原有精度', () => {
  assert.equal(formatWeightKg(10.996), '10.996')
  assert.equal(formatWeightKg(10.9965), '10.997')
  assert.equal(formatWeightKg(false), '')
  assert.equal(validWeightKg('10.996'), true)
  assert.equal(validWeightKg('10.9965'), false)
  assert.equal(stepWeightKgValue('10.996', -1), '10.995')
  assert.equal(stepWeightKgValue('10.996', 1), '10.997')
  assert.equal(stepWeightKgValue('1', -1), '1')
})
