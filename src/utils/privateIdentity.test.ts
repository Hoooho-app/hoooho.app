import assert from 'node:assert/strict'
import test from 'node:test'
import { compactIdentityAge, maskIdentityName, recordSubjectRelationship } from './privateIdentity'

test('identity chrome follows the owner-approved two- and three-character privacy rules', () => {
  assert.equal(maskIdentityName('刘磊'), '*磊')
  assert.equal(maskIdentityName('刘景一'), '刘*一')
  assert.equal(maskIdentityName('  王小明  '), '王*明')
})

test('empty, single-character and longer Unicode names do not leak an unmasked identity', () => {
  assert.equal(maskIdentityName(undefined), '')
  assert.equal(maskIdentityName(''), '')
  assert.equal(maskIdentityName('一'), '*')
  assert.equal(maskIdentityName('欧阳小明'), '欧**明')
  assert.equal(maskIdentityName('𠮷田'), '*田')
})

test('child relationships are user-centered without changing adult relationship meanings', () => {
  assert.equal(recordSubjectRelationship({ relation: '子女', gender: 'female' }), '女儿')
  assert.equal(recordSubjectRelationship({ relation: '子女', gender: 'male' }), '儿子')
  assert.equal(recordSubjectRelationship({ relation: '子女', gender: 'undisclosed' }), '子女')
  assert.equal(recordSubjectRelationship({ relation: '母亲', gender: 'female' }), '母亲')
})

test('identity summaries show one meaningful age unit while preserving the original display value', () => {
  assert.equal(compactIdentityAge('2岁0个月28天'), '2岁')
  assert.equal(compactIdentityAge('0岁11个月10天'), '11个月')
  assert.equal(compactIdentityAge('0岁0个月6天'), '6天')
  assert.equal(compactIdentityAge('0岁0个月0天'), '0天')
  assert.equal(compactIdentityAge('未填写'), '未填写')
})
