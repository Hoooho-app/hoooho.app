import assert from 'node:assert/strict'
import test from 'node:test'
import { quickNoteExamples, quickNoteTiming } from './quickNoteExamples'

test('首页静态示例严格按产品顺序，不加入诊断结论', () => {
  assert.deepEqual(quickNoteExamples, ['换了洗衣液，身上起了红疹','上午测到体温38.2℃','吃过鸡蛋后，嘴边出现红疹','摸过小猫后，眼睛痒、打喷嚏','打扫房间后，鼻子痒、流鼻涕','换了配方奶，记下喝奶的情况','喝奶后，嘴边发红、身上发痒','今天大便偏稀，已经三次了','手臂涂了面霜，之后有点发红','吃过虾后，身上起了红疙瘩'])
  assert.deepEqual(quickNoteTiming, { type: 90, hold: 2200, delete: 45, empty: 300 })
})
