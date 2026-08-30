import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createIdleNurseAnimationState,
  normalizeNurseAnimationState,
  resolveNurseAnimationKind,
  transitionNurseAnimation
} from './nurseAnimationController.ts'

test('动画控制器初始状态和未知状态都安全回退到 idle', () => {
  assert.deepEqual(createIdleNurseAnimationState(), { action: null, kind: 'idle', requestId: 0 })
  assert.equal(normalizeNurseAnimationState({ kind: 'unknown', requestId: 4 }).kind, 'idle')
  assert.equal(normalizeNurseAnimationState({ kind: 'special', action: 'unknown', requestId: 5 }).kind, 'idle')
  assert.equal(normalizeNurseAnimationState(undefined).kind, 'idle')
})

test('明确业务状态优先于用户动作、趣味动作和待机', () => {
  assert.equal(resolveNurseAnimationKind('listening', true, true), 'listening')
  assert.equal(resolveNurseAnimationKind(null, true, true), 'special')
  assert.equal(resolveNurseAnimationKind(null, false, true), 'special')
  assert.equal(resolveNurseAnimationKind(null, false, false), 'idle')
})

test('普通特殊动作结束后通过统一事件返回 idle', () => {
  const special = transitionNurseAnimation(createIdleNurseAnimationState(), {
    type: 'PLAY', kind: 'special', action: 'chairSpin', requestId: 1
  })
  assert.equal(special.kind, 'special')
  assert.equal(transitionNurseAnimation(special, { type: 'RETURN_TO_IDLE', requestId: 1 }).kind, 'idle')
})

test('成功和错误动画结束后都通过统一事件返回 idle', () => {
  for (const kind of ['success', 'error'] as const) {
    const state = transitionNurseAnimation(createIdleNurseAnimationState(), { type: 'PLAY', kind, requestId: 2 })
    assert.equal(transitionNurseAnimation(state, { type: 'RETURN_TO_IDLE', requestId: 2 }).kind, 'idle')
  }
})

test('高优先级业务状态会立即打断特殊动画', () => {
  const special = transitionNurseAnimation(createIdleNurseAnimationState(), {
    type: 'PLAY', kind: 'special', action: 'stretch', requestId: 3
  })
  const listening = transitionNurseAnimation(special, { type: 'PLAY', kind: 'listening', requestId: 4 })
  assert.equal(listening.kind, 'listening')
  assert.equal(listening.action, null)
})

test('旧视频迟到的 ended 事件不能覆盖较新的业务状态', () => {
  const special = transitionNurseAnimation(createIdleNurseAnimationState(), {
    type: 'PLAY', kind: 'special', action: 'waterPlant', requestId: 5
  })
  const processing = transitionNurseAnimation(special, { type: 'PLAY', kind: 'processing', requestId: 6 })
  assert.equal(transitionNurseAnimation(processing, { type: 'RETURN_TO_IDLE', requestId: 5 }).kind, 'processing')
})

test('强制回退会使旧请求失效并保持 idle', () => {
  const special = transitionNurseAnimation(createIdleNurseAnimationState(), {
    type: 'PLAY', kind: 'special', action: 'stretch', requestId: 7
  })
  const idle = transitionNurseAnimation(special, { type: 'FORCE_IDLE', requestId: 8 })
  assert.equal(idle.kind, 'idle')
  assert.equal(transitionNurseAnimation(idle, { type: 'RETURN_TO_IDLE', requestId: 7 }).requestId, 8)
})
