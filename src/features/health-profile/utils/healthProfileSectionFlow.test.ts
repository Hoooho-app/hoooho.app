import assert from 'node:assert/strict'
import test from 'node:test'
import { getInitialHealthProfileSectionView } from './healthProfileSectionFlow.ts'

test('没有记录的健康档案分类直接进入新增表单', () => {
  assert.equal(getInitialHealthProfileSectionView([]), 'create')
})

test('已有记录的健康档案分类进入记录列表', () => {
  assert.equal(getInitialHealthProfileSectionView([{ id: 'record-1' }]), 'list')
})
