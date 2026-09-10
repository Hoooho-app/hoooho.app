import assert from 'node:assert/strict'
import test from 'node:test'
import { growthCardActionLabel, growthCardMissing, validHeight, validRh, validWeight } from './growthCardForm.ts'

test('成长快照不把血型设为必填并按核心输入切换文案', () => {
  assert.deepEqual(growthCardMissing({}), ['身高', '体重'])
  assert.equal(growthCardActionLabel({}, false), '填写身长后即可查看')
  assert.equal(growthCardActionLabel({}, false, '身高'), '填写身高后即可查看')
  assert.equal(growthCardActionLabel({ height: '82' }, false), '再填体重，建立成长坐标')
  assert.equal(growthCardActionLabel({ height: '82', weight: '11.2' }, false), '保存成长快照')
  assert.equal(growthCardActionLabel({ aboBloodType: 'A' }, false), '保存血型')
  assert.equal(validRh('unknown'), true)
})

test('身高体重沿用服务端合理范围并允许小数', () => {
  assert.equal(validHeight('82.5'), true)
  assert.equal(validWeight('11.2'), true)
  assert.equal(validHeight('19.9'), false)
  assert.equal(validWeight('0'), false)
})
