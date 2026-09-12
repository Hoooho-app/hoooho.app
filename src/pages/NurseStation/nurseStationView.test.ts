import assert from 'node:assert/strict'
import test from 'node:test'
import type { NurseStationItem } from '../../features/nurse-station/state'
import { getArchivedTasks, getGuardedDays, getUnreadTips, sortActiveTasks, taskStatus, taskTitle, tipKey } from './nurseStationView'

const base = { memberId: 'child', sourceEventId: 'event', relatedEventIds: ['event'], sourceLabel: '发热 · 9/8 10:00', createdAt: '2026-09-08T02:00:00Z', updatedAt: '2026-09-08T02:00:00Z' }
const item = (changes: Partial<NurseStationItem>): NurseStationItem => ({ ...base, id: 'one', type: 'symptom_observation', status: 'active', title: '要开启体温观察吗？', ...changes })

test('守护任务只接收已确认项目并使用真实类型和状态', () => {
  const tasks = sortActiveTasks([item({ id: 'pending', status: 'pending_confirmation' }), item({ id: 'active' }), item({ id: 'paused', status: 'paused' })])
  assert.deepEqual(tasks.map(({ id }) => id), ['active', 'paused'])
  assert.equal(taskTitle(tasks[0]), '发热观察')
  assert.equal(taskStatus(tasks[1]), '已暂停')
})

test('护理贴士按任务主题聚合且已查看主题不再计数', () => {
  const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'medicine', type: 'medication_reminder', sourceLabel: '服药 · 9/8 12:00' })]
  assert.deepEqual(getUnreadTips(items, []).map(({ id }) => id), ['b', 'medicine'])
  assert.deepEqual(getUnreadTips(items, [tipKey(items[1])]).map(({ id }) => id), ['medicine'])
})

test('完成任务进入归档而拒绝建议不进入归档', () => {
  assert.deepEqual(getArchivedTasks([item({ id: 'done', status: 'completed' }), item({ id: 'dismissed', status: 'dismissed' })]).map(({ id }) => id), ['done'])
})

test('守护天数按本地自然日计算并安全处理无效日期', () => {
  assert.equal(getGuardedDays('2026-09-10T23:30:00+08:00', new Date('2026-09-12T00:05:00+08:00')), 3)
  assert.equal(getGuardedDays('not-a-date', new Date('2026-09-12T00:05:00+08:00')), 1)
  assert.equal(getGuardedDays(null), 1)
})
