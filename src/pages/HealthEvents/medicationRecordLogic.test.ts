import test from 'node:test'
import assert from 'node:assert/strict'
import { medicationSummary, normalizeDose, validMedicationAmount } from './medicationRecordLogic'

test('medication summary only presents recorded facts', () => {
  assert.equal(medicationSummary({ medicationName: '氯雷他定片', administrationRoute: 'oral', amountValue: 2.5, amountUnit: 'mL' }), '口服 · 氯雷他定片 · 2.5 mL')
  assert.equal(medicationSummary({ medicationName: '药膏', administrationRoute: 'topical' }), '外用 · 药膏 · 用量未填写')
})

test('multi-drug summary and dose steps preserve recorded values', () => {
  const medications = [
    { id: 'one', medicationName: '布洛芬混悬液', amountValue: 2.5, amountUnit: 'mL', dosageStep: 0.5 as const },
    { id: 'two', medicationName: '对乙酰氨基酚', amountValue: 1, amountUnit: '片', dosageStep: 1 as const }
  ]
  assert.equal(medicationSummary({ medications, medicationName: medications[0].medicationName, administrationRoute: 'oral' }), '布洛芬混悬液 · 2.5 mL\n对乙酰氨基酚 · 1 片')
  assert.equal(normalizeDose(2.36, 0.5), 2.5)
  assert.equal(normalizeDose(-0.2, 0.1), 0)
})

test('medication amount accepts decimals but rejects zero and negatives', () => {
  assert.equal(validMedicationAmount(''), true)
  assert.equal(validMedicationAmount('2.5'), true)
  assert.equal(validMedicationAmount('0'), false)
  assert.equal(validMedicationAmount('-1'), false)
})
