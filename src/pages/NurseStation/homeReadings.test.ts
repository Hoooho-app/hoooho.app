import assert from 'node:assert/strict'
import test from 'node:test'
import { readHomeReading, writeHomeReading } from './homeReadings'
test('首页成功读数缓存严格隔离会话与孩子，不把缺失读数伪造为零', () => {
  assert.equal(readHomeReading('session-a', 'child-a', 'followUpCount'), undefined)
  writeHomeReading('session-a', 'child-a', 'followUpCount', 3)
  assert.equal(readHomeReading('session-a', 'child-a', 'followUpCount'), 3)
  assert.equal(readHomeReading('session-a', 'child-b', 'followUpCount'), undefined)
  writeHomeReading('session-a', 'child-b', 'followUpCount', 0)
  assert.equal(readHomeReading('session-a', 'child-b', 'followUpCount'), 0)
  assert.equal(readHomeReading('session-b', 'child-a', 'followUpCount'), undefined)
  assert.equal(readHomeReading('session-a', 'child-a', 'followUpCount'), undefined)
})
test('首页缓存只在短期返回时使用，不持久化过期读数', () => {
  const originalNow = Date.now
  let now = 1000
  try {
    Date.now = () => now
    writeHomeReading('freshness-session', 'child', 'followUpCount', 4)
    now += 299999; assert.equal(readHomeReading('freshness-session', 'child', 'followUpCount'), 4)
    now++; assert.equal(readHomeReading('freshness-session', 'child', 'followUpCount'), undefined)
  } finally { Date.now = originalNow }
})
