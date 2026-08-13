import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateBmi,
  combineBloodType,
  getBasicHealthProfileValues,
  getInitialHealthProfileRecords,
  splitBloodType,
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
    combinedBloodType: 'A-',
    _originalBloodType: 'A',
    _originalRhBloodType: 'negative'
  })
  assert.equal(getInitialHealthProfileRecords('basic', [], member).length, 1)
})

test('旧本地基础档案值仅作为成员字段缺失时的兼容回填', () => {
  const stored = [{ height: '170', weight: '60', bloodType: 'B', waistCircumference: '80' }]
  assert.deepEqual(
    getInitialHealthProfileRecords('basic', stored, { heightCm: 168 }),
    [{
      height: '168', weight: '60', waistCircumference: '80', bodyFatPercentage: '',
      combinedBloodType: '', _originalBloodType: 'B', _originalRhBloodType: '', _savedAt: 'member-health-profile'
    }]
  )
})

test('所有基础健康字段均可留空并保存为 null', () => {
  assert.deepEqual(toFamilyMemberHealthUpdate({}), {
    heightCm: null,
    weightKg: null,
    waistCircumferenceCm: null,
    bodyFatPercentage: null,
    bloodType: null,
    rhBloodType: null
  })
})

test('组合血型映射为兼容的 ABO 与 Rh(D) 字段', () => {
  assert.deepEqual(toFamilyMemberHealthUpdate({
    combinedBloodType: 'AB+', _combinedBloodTypeTouched: true
  }), {
    heightCm: null,
    weightKg: null,
    waistCircumferenceCm: null,
    bodyFatPercentage: null,
    bloodType: 'AB',
    rhBloodType: 'positive'
  })
  assert.equal(combineBloodType('O', 'negative'), 'O-')
  assert.deepEqual(splitBloodType('B+'), { bloodType: 'B', rhBloodType: 'positive' })

  for (const value of ['A+','A-','B+','B-','AB+','AB-','O+','O-']) {
    const split = splitBloodType(value)
    assert.equal(combineBloodType(split.bloodType ?? undefined, split.rhBloodType ?? undefined), value)
  }
})

test('只有旧 ABO 数据时保存其他字段不会清空原血型', () => {
  assert.deepEqual(toFamilyMemberHealthUpdate({
    height: '170', combinedBloodType: '', _originalBloodType: 'B', _originalRhBloodType: ''
  }), {
    heightCm: 170,
    weightKg: null,
    waistCircumferenceCm: null,
    bodyFatPercentage: null,
    bloodType: 'B',
    rhBloodType: null
  })
})

test('BMI 仅在身高与体重同时存在时计算', () => {
  assert.equal(calculateBmi('170', '60'), '20.8')
  assert.equal(calculateBmi('170', ''), '')
  assert.equal(calculateBmi('', '60'), '')
  assert.equal(calculateBmi('0', '60'), '')
  assert.equal(calculateBmi('invalid', '60'), '')
})
