import test from 'node:test'
import assert from 'node:assert/strict'
import { medicationSummary, validMedicationAmount } from './medicationRecordLogic'

test('medication summary only presents recorded facts', () => {
  assert.equal(medicationSummary({ medicationName: '氯雷他定片', administrationRoute: 'oral', amountValue: 2.5, amountUnit: 'mL' }), '口服 · 氯雷他定片 · 2.5 mL')
  assert.equal(medicationSummary({ medicationName: '药膏', administrationRoute: 'topical' }), '外用 · 药膏 · 用量未填写')
})

test('medication amount accepts decimals but rejects zero and negatives', () => {
  assert.equal(validMedicationAmount(''), true)
  assert.equal(validMedicationAmount('2.5'), true)
  assert.equal(validMedicationAmount('0'), false)
  assert.equal(validMedicationAmount('-1'), false)
})
