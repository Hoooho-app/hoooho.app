import assert from 'node:assert/strict'
import test from 'node:test'
import { FOOD_ALLERGY_INDEX_DIMENSIONS, FOOD_ALLERGY_INDEX_FORMULA } from './foodAllergyStatusIndexContent'
test('完整度说明包含四维及实际运行公式', () => {
  assert.deepEqual(FOOD_ALLERGY_INDEX_DIMENSIONS.map(item => item.key), ['A','B','C','H'])
  assert.ok(FOOD_ALLERGY_INDEX_FORMULA.includes('K ÷ (4 × N)'))
  assert.doesNotMatch(JSON.stringify(FOOD_ALLERGY_INDEX_DIMENSIONS), /暂未开放|参数待验证|可以食用|已康复/)
})
