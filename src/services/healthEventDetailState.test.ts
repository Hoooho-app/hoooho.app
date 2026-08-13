import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventRecordApiDto } from '../types/index.ts'
import { hasPersistedHealthEventRecords } from './healthEventDetailState.ts'

test('空 Event 容器仍处于首次记录状态', () => {
  assert.equal(hasPersistedHealthEventRecords([]), false)
})

test('第一条已持久化 Record 创建后进入正式详情状态', () => {
  const record = { id: 'record-1' } as HealthEventRecordApiDto
  assert.equal(hasPersistedHealthEventRecords([record]), true)
})
