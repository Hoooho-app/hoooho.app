import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateBmi,
  getBasicHealthProfileValues,
  getInitialHealthProfileRecords,
  toFamilyMemberHealthUpdate
} from './healthProfileBasicInfo.ts'

test('成员已有基础健康字段会完整映射，并兼容原 ABO 血型字段', () => {
  const member = {
    heightCm: 168.5,
    weightKg: 56,
    waistCircumferenceCm: 72,
    bodyFatPercentage: 21.5,
    headCircumferenceCm: 55,
    bloodType: 'A' as const,
    rhBloodType: 'negative' as const
  }

  assert.deepEqual(getBasicHealthProfileValues(member), {
    height: '168.5',
    weight: '56',
    waistCircumference: '72',
    bodyFatPercentage: '21.5',
    headCircumference: '55',
    bloodType: 'A',
    rhBloodType: 'negative'
  })
  assert.equal(getInitialHealthProfileRecords('basic', [], member).length, 1)
})

test('旧本地基础档案值仅作为成员字段缺失时的兼容回填', () => {
  const stored = [{ height: '170', weight: '60', bloodType: 'B', waistCircumference: '80' }]
  assert.deepEqual(
    getInitialHealthProfileRecords('basic', stored, { heightCm: 168 }),
    [{
      height: '168', weight: '60', waistCircumference: '80', bodyFatPercentage: '',
      headCircumference: '', bloodType: 'B', rhBloodType: '', _savedAt: 'member-health-profile'
    }]
  )
})

test('所有基础健康字段均可留空并保存为 null', () => {
  assert.deepEqual(toFamilyMemberHealthUpdate({}), {
    heightCm: null,
    weightKg: null,
    waistCircumferenceCm: null,
    bodyFatPercentage: null,
    headCircumferenceCm: null,
    bloodType: null,
    rhBloodType: null
  })
})

test('头围、ABO 与 Rh(D) 可独立保存', () => {
  assert.deepEqual(toFamilyMemberHealthUpdate({
    headCircumference: '46.5', bloodType: 'AB', rhBloodType: 'positive'
  }), {
    heightCm: null,
    weightKg: null,
    waistCircumferenceCm: null,
    bodyFatPercentage: null,
    headCircumferenceCm: 46.5,
    bloodType: 'AB',
    rhBloodType: 'positive'
  })
})

test('BMI 仅在身高与体重同时存在时计算', () => {
  assert.equal(calculateBmi('170', '60'), '20.8')
  assert.equal(calculateBmi('170', ''), '')
  assert.equal(calculateBmi('', '60'), '')
})
