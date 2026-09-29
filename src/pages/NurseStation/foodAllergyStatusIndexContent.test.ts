import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FOOD_ALLERGY_INDEX_DIMENSIONS,
  FOOD_ALLERGY_INDEX_FORMULAS,
  FOOD_ALLERGY_INDEX_SOURCES,
  FOOD_ALLERGY_INDEX_STATUS,
  FOOD_ALLERGY_INDEX_VARIABLES,
} from './foodAllergyStatusIndexContent'

test('未启用算法时只暴露真实状态和已确认的公式结构', () => {
  assert.equal(FOOD_ALLERGY_INDEX_STATUS.kind, 'unavailable')
  assert.equal(FOOD_ALLERGY_INDEX_STATUS.label, '暂未开放计算')
  assert.equal(FOOD_ALLERGY_INDEX_FORMULAS.length, 3)
  assert.deepEqual(FOOD_ALLERGY_INDEX_DIMENSIONS.map((item) => item.key), ['A', 'B', 'C'])
  assert.deepEqual(FOOD_ALLERGY_INDEX_SOURCES.map((item) => item[0]), ['过敏史', '健康随记', '就医记录或已上传报告', '排敏测试记录'])
  const serialized = JSON.stringify({
    dimensions: FOOD_ALLERGY_INDEX_DIMENSIONS,
    formulas: FOOD_ALLERGY_INDEX_FORMULAS,
    sources: FOOD_ALLERGY_INDEX_SOURCES,
    status: FOOD_ALLERGY_INDEX_STATUS,
    variables: FOOD_ALLERGY_INDEX_VARIABLES,
  })
  assert.doesNotMatch(serialized, /72%|权重|默认分数|治愈率/)
})
