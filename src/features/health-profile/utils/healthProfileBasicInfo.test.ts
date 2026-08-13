import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getBasicHealthProfileValues,
  getInitialHealthProfileRecords,
  toFamilyMemberHealthUpdate
} from './healthProfileBasicInfo.ts'

test('成员已有身高体重血型会映射为基础健康信息记录', () => {
  const member = { heightCm: 168.5, weightKg: 56, bloodType: 'A' as const }

  assert.deepEqual(getBasicHealthProfileValues(member), {
    height: '168.5',
    weight: '56',
    bloodType: 'A'
  })
  assert.equal(getInitialHealthProfileRecords('basic', [], member).length, 1)
})

test('已有档案记录优先，不重复生成成员健康记录', () => {
  const stored = [{ height: '170', weight: '60', bloodType: 'B' }]
  assert.deepEqual(
    getInitialHealthProfileRecords('basic', stored, { heightCm: 168 }),
    stored
  )
})

test('基础健康表单值复用原成员字段更新结构', () => {
  assert.deepEqual(toFamilyMemberHealthUpdate({ height: '172.5', weight: '', bloodType: '未知' }), {
    heightCm: 172.5,
    weightKg: null,
    bloodType: null
  })
})
