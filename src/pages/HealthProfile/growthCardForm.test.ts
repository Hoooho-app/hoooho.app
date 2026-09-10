import assert from 'node:assert/strict'
import test from 'node:test'
import { growthCardActionLabel, growthCardMissing, validHeight, validWeight } from './growthCardForm.ts'

test('成长身份卡缺失项和操作文案按真实表单值计算', () => {
  assert.deepEqual(growthCardMissing({}), ['身高', '体重', '血型'])
  assert.equal(growthCardActionLabel({ height: '82', weight: '11.2' }, false), '选择血型后即可生成')
  assert.equal(growthCardActionLabel({ height: '82', weight: '11.2', aboBloodType: 'A' }, false), '生成成长身份卡')
  assert.equal(growthCardActionLabel({ height: '82', weight: '11.2', aboBloodType: 'A' }, true), '更新成长数据')
})

test('身高体重沿用服务端合理范围并允许小数', () => {
  assert.equal(validHeight('82.5'), true)
  assert.equal(validWeight('11.2'), true)
  assert.equal(validHeight('19.9'), false)
  assert.equal(validWeight('0'), false)
})
