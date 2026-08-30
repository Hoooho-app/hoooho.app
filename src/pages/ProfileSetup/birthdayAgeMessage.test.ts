import assert from 'node:assert/strict'
import test from 'node:test'
import { getBirthdayAgeMessage } from './birthdayAgeMessage.ts'

const today = new Date('2026-08-30T12:00:00+08:00')

test('出生信息完整时按精度显示计算后的年龄', () => {
  assert.equal(getBirthdayAgeMessage('1990', 'year', today), '年龄：约36岁')
  assert.equal(getBirthdayAgeMessage('1990-12-22', 'date', today), '年龄：35岁')
})

test('出生信息不完整或无效时保留填写提示', () => {
  assert.equal(getBirthdayAgeMessage('199', 'year', today), '填写后自动计算年龄')
  assert.equal(getBirthdayAgeMessage('2027-01-01', 'date', today), '填写后自动计算年龄')
})
