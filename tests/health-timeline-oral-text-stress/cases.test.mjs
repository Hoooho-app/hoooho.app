import assert from 'node:assert/strict'
import test from 'node:test'
import { formalCases, groupCounts, variantCases } from './cases.mjs'

const expectedGroupCounts = { A: 10, B: 15, C: 15, D: 15, E: 15, F: 12, G: 10, H: 10, I: 10, J: 8 }

test('正式分母在执行前冻结为 120 例并满足分组配额', () => {
  assert.equal(formalCases.length, 120)
  assert.deepEqual(groupCounts, expectedGroupCounts)
  assert.equal(new Set(formalCases.map(({ caseId }) => caseId)).size, 120)
  assert.equal(new Set(formalCases.map(({ input }) => input)).size, 120)
  assert.ok(formalCases.every(Object.isFrozen))
})

test('每个正式案例声明来源、人物、时间、预期和持久化规则', () => {
  for (const item of formalCases) {
    assert.match(item.caseId, /^[A-J]\d{2}$/)
    assert.ok(item.input.length > 0)
    assert.ok(['self', 'child', 'elder'].includes(item.memberKey))
    assert.equal(item.expectedSource, 'text_record')
    assert.ok(Array.isArray(item.expectedFacts))
    assert.ok(Array.isArray(item.expectedNegatedFacts))
    assert.ok(Array.isArray(item.forbiddenFacts))
    assert.equal(typeof item.shouldPersist, 'boolean')
  }
})

test('高风险持久化全集和人物归属门槛固定', () => {
  const persistenceGroups = new Set(['B', 'C', 'D', 'F', 'G', 'J'])
  assert.equal(formalCases.filter(({ group }) => persistenceGroups.has(group)).length, 75)
  assert.equal(formalCases.filter(({ group }) => group === 'F').length, 12)
  assert.ok(formalCases.filter(({ group }) => group === 'F').every(({ risk }) => risk === 'P0'))
})

test('语义变体独立于正式分母且至少 20 例', () => {
  assert.equal(variantCases.length, 20)
  assert.equal(new Set(variantCases.map(({ caseId }) => caseId)).size, 20)
  assert.ok(variantCases.every(({ formal }) => formal === false))
  assert.ok(variantCases.every(({ baseCaseId }) => formalCases.some(({ caseId }) => caseId === baseCaseId)))
  assert.ok(variantCases.every(({ caseId }) => !formalCases.some((item) => item.caseId === caseId)))
})
