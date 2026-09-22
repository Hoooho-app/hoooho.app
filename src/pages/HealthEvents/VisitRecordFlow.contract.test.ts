import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const flow = readFileSync(new URL('./VisitRecordFlow.tsx', import.meta.url), 'utf8')
const service = readFileSync(new URL('../../services/quickRecords.ts', import.meta.url), 'utf8')

test('visit flow is document first and has no relationship or required manual medical form', () => {
  for (const label of ['先上传就医资料', '拍照', '从相册选择', '上传文件', '原始资料', '帮你整理好了', '实际就医时间', '保存就医记录']) assert.match(flow, new RegExp(label))
  assert.match(flow, /application\/pdf/)
  assert.doesNotMatch(flow, /关联已有症状|关联上一次就医|医生姓名|看了哪个科|接下来怎么处理/)
})

test('document recognition keeps source, uncertainty, edit and stale-request protection', () => {
  assert.match(flow, /analysisVersion/)
  assert.match(flow, /sourceDocumentId/)
  assert.match(flow, /sourceName/)
  assert.match(flow, /status: 'user_edited'/)
  assert.match(flow, /资料中没有明确时间/)
  assert.match(flow, /整理失败，可重试或保留原件/)
  assert.match(service, /analyzeDocument/)
})
