import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canRunIdleNurseAnimation,
  IdleAnimationScheduler,
  nextIdleNurseDelay,
  playIdleVideoSafely,
  selectIdleNurseAction,
  type IdleNurseAction
} from './idleNurseAnimation.ts'

class FakeTimers {
  private nextId = 1
  private now = 0
  private readonly tasks = new Map<number, { at: number; callback: () => void }>()

  readonly setTimeout = (callback: () => void, delay: number) => {
    const id = this.nextId
    this.nextId += 1
    this.tasks.set(id, { at: this.now + delay, callback })
    return id as ReturnType<typeof setTimeout>
  }

  readonly clearTimeout = (id: ReturnType<typeof setTimeout>) => {
    this.tasks.delete(id as number)
  }

  get pendingCount() {
    return this.tasks.size
  }

  tick(duration: number) {
    const target = this.now + duration
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0]
      if (!next) break
      const [id, task] = next
      this.tasks.delete(id)
      this.now = task.at
      task.callback()
    }
    this.now = target
  }
}

const randomSequence = (...values: number[]) => {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}

const createScheduler = (clock: FakeTimers, random: () => number, played: IdleNurseAction[], prepared: IdleNurseAction[] = []) => new IdleAnimationScheduler({
  clearTimer: clock.clearTimeout,
  onPlay: (action) => played.push(action),
  onPrepare: (action) => prepared.push(action),
  random,
  setTimer: clock.setTimeout
})

test('待机等待时间覆盖 3000 到 4000 毫秒且不是固定值', () => {
  assert.equal(nextIdleNurseDelay(0), 3_000)
  assert.equal(nextIdleNurseDelay(0.5), 3_500)
  assert.equal(nextIdleNurseDelay(1), 4_000)
})

test('2999 毫秒不能播放，达到随机等待时间后只播放一个动作', () => {
  const clock = new FakeTimers()
  const played: IdleNurseAction[] = []
  const prepared: IdleNurseAction[] = []
  const scheduler = createScheduler(clock, randomSequence(0, 0), played, prepared)
  scheduler.start()

  assert.deepEqual(prepared, ['stretch'])
  assert.equal(clock.pendingCount, 1)
  clock.tick(2_999)
  assert.deepEqual(played, [])
  clock.tick(1)
  assert.deepEqual(played, ['stretch'])
  assert.equal(clock.pendingCount, 0)
})

test('4000 毫秒边界在 3999 毫秒时仍不播放', () => {
  const clock = new FakeTimers()
  const played: IdleNurseAction[] = []
  const scheduler = createScheduler(clock, randomSequence(0, 1), played)
  scheduler.start()
  clock.tick(3_999)
  assert.deepEqual(played, [])
  clock.tick(1)
  assert.equal(played.length, 1)
})

test('视频播放期间不启动下一次等待，动作完成后重新等待完整 3 秒', () => {
  const clock = new FakeTimers()
  const played: IdleNurseAction[] = []
  const scheduler = createScheduler(clock, randomSequence(0, 0, 0, 0), played)
  scheduler.start()
  clock.tick(3_000)
  clock.tick(30_000)
  assert.equal(played.length, 1)
  assert.equal(clock.pendingCount, 0)

  scheduler.completeAction()
  assert.equal(clock.pendingCount, 1)
  clock.tick(2_999)
  assert.equal(played.length, 1)
  clock.tick(1)
  assert.equal(played.length, 2)
})

test('随机动作排除上一次，同一动作不会连续出现', () => {
  const actions: IdleNurseAction[] = ['stretch', 'chairSpin', 'waterPlant']
  actions.forEach((lastAction) => {
    for (const randomValue of [0, 0.25, 0.5, 0.75, 1]) {
      assert.notEqual(selectIdleNurseAction(lastAction, randomValue), lastAction)
    }
  })
})

test('三个动作可经过多轮持续随机播放且没有机械固定顺序', () => {
  const clock = new FakeTimers()
  const played: IdleNurseAction[] = []
  const scheduler = createScheduler(clock, randomSequence(0.1, 0, 0.95, 0, 0.45, 0, 0.9, 0, 0.2, 0), played)
  scheduler.start()
  for (let round = 0; round < 5; round += 1) {
    clock.tick(3_000)
    if (round < 4) scheduler.completeAction()
  }
  assert.equal(played.length, 5)
  played.slice(1).forEach((action, index) => assert.notEqual(action, played[index]))
  assert.ok(new Set(played).size >= 2)
})

test('离开待机、进入业务流程、页面隐藏或卸载会立即清除唯一计时器', () => {
  const protectedStates = ['attention', 'preparing', 'listening', 'speechPaused', 'reviewing', 'awaitingConfirmation', 'saving', 'saved', 'error']
  protectedStates.forEach((state) => assert.equal(canRunIdleNurseAnimation(state, true, false), false))
  assert.equal(canRunIdleNurseAnimation('idle', false, false), false)
  assert.equal(canRunIdleNurseAnimation('idle', true, true), false)

  const clock = new FakeTimers()
  const played: IdleNurseAction[] = []
  const scheduler = createScheduler(clock, randomSequence(0, 0), played)
  scheduler.start()
  scheduler.stop()
  assert.equal(clock.pendingCount, 0)
  clock.tick(10_000)
  assert.deepEqual(played, [])
})

test('页面恢复或切换人物后重新等待 3 到 4 秒，不会立即播放旧动作', () => {
  const clock = new FakeTimers()
  const played: IdleNurseAction[] = []
  const scheduler = createScheduler(clock, randomSequence(0, 0, 0.9, 0), played)
  scheduler.start()
  clock.tick(2_500)
  scheduler.stop()
  scheduler.reset()
  assert.equal(clock.pendingCount, 1)
  clock.tick(2_999)
  assert.deepEqual(played, [])
  clock.tick(1)
  assert.equal(played.length, 1)
})

test('视频准备或播放失败可以跳过并重新安排完整等待', () => {
  const clock = new FakeTimers()
  const played: IdleNurseAction[] = []
  const prepared: IdleNurseAction[] = []
  const scheduler = createScheduler(clock, randomSequence(0, 0, 0.9, 0), played, prepared)
  scheduler.start()
  scheduler.skipPreparedAction()
  assert.equal(clock.pendingCount, 1)
  assert.equal(prepared.length, 2)
  assert.notEqual(prepared[0], prepared[1])
  clock.tick(2_999)
  assert.deepEqual(played, [])
  clock.tick(1)
  assert.equal(played.length, 1)
})

test('play Promise 拒绝会被捕获而不是形成未处理错误', async () => {
  const failure = new Error('autoplay rejected')
  assert.equal(await playIdleVideoSafely(() => Promise.reject(failure)), failure)
  assert.equal(await playIdleVideoSafely(() => Promise.resolve()), null)
})
