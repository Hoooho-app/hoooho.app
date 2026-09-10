import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventApiDto, Member } from '../../types'
import { buildAllergyOverview, buildBasicOverview, formatGrowthCardUpdatedAt } from './healthProfileOverview.ts'

const member: Member = { id: 'child-1', name: '孩子', age: '1岁', relation: '子女', heightCm: 78, weightKg: 9.2 }

test('基础信息合并人物、出生和最新成长数据', () => {
  const result = buildBasicOverview(member, new Map([['birth', [{ gestationalWeeks: 39 }]], ['growth', [{ date: '2026-01-01', headCircumference: 45 }]]]))
  assert.equal(result.filled, true)
  assert.equal(result.summary, '足月出生 · 78 cm · 9.2 kg · 头围 45 cm')
  assert.equal(result.missingCount, 0)
  assert.equal(result.complete, true)
})

test('成长身份卡由身高体重建立，血型保持可选', () => {
  const result = buildBasicOverview({ ...member, bloodType: 'AB' }, new Map())
  assert.equal(result.complete, true)
  assert.equal(result.missingCount, 0)
  assert.equal(result.bloodType, 'AB')
  assert.equal(formatGrowthCardUpdatedAt('2026-09-10T02:00:00.000Z', new Date('2026-09-10T12:00:00.000Z')), '更新于今天')
})

test('过敏汇总严格按当前人物和明确状态', () => {
  const event = (id: string, memberId: string, startTime: string): HealthEventApiDto => ({ id, accountId: 'a', memberId, title: '出现红疹', category: 'allergy', status: 'observing', startTime, createdAt: startTime, updatedAt: startTime })
  const result = buildAllergyOverview([{ id:'1', certainty:'正在排查', subject:'花生' },{ id:'2', certainty:'怀疑中', subject:'花粉' },{ id:'3', certainty:'医生已确认', subject:'猫毛' },{ id:'4', certainty:'已明确', subject:'旧记录' },{ id:'empty' }], [event('other','child-2','2026-09-05T00:00:00Z'),event('mine','child-1','2026-09-04T00:00:00Z')], 'child-1')
  assert.deepEqual({ total:result.total, investigating:result.investigating, suspected:result.suspected, doctorConfirmed:result.doctorConfirmed }, { total:4, investigating:1, suspected:1, doctorConfirmed:1 })
  assert.match(result.latest, /^9月4日 · 出现红疹$/)
})
