import assert from 'node:assert/strict'
import test from 'node:test'
import { startIndependentRegionLoads } from './healthEventsListLoading.ts'

test('成员请求 pending 不阻塞事件列表完成', async () => {
  const loads = startIndependentRegionLoads(
    () => new Promise<never>(() => undefined),
    async () => ['event-1']
  )
  assert.deepEqual(await loads.events, ['event-1'])
})

test('事件请求失败不阻塞成员区域完成', async () => {
  const loads = startIndependentRegionLoads(
    async () => ['member-1'],
    async () => { throw new Error('events failed') }
  )
  void loads.events.catch(() => undefined)
  assert.deepEqual(await loads.members, ['member-1'])
})
