export type IdleNurseAction = 'stretch' | 'chairSpin' | 'waterPlant'

export function canRunIdleNurseAnimation(state: string, pageVisible: boolean, reducedMotion: boolean) {
  return state === 'idle' && pageVisible && !reducedMotion
}

export const idleNurseActions = [
  { id: 'stretch', source: '/nurse-triage/idle-blonde-stretch.mp4', weight: 0.4 },
  { id: 'chairSpin', source: '/nurse-triage/idle-blonde-chair-spin.mp4', weight: 0.35 },
  { id: 'waterPlant', source: '/nurse-triage/idle-blonde-water-plant.mp4', weight: 0.25 }
] as const satisfies ReadonlyArray<{ id: IdleNurseAction; source: string; weight: number }>

const clampRandom = (value: number) => Math.max(0, Math.min(1, value))

export function nextIdleNurseDelay(randomValue = Math.random()) {
  return 3_000 + Math.round(clampRandom(randomValue) * 1_000)
}

export function selectIdleNurseAction(lastAction: IdleNurseAction | null, randomValue = Math.random()) {
  const candidates = idleNurseActions.filter((action) => action.id !== lastAction)
  if (candidates.length === 0) return null

  const totalWeight = candidates.reduce((total, action) => total + action.weight, 0)
  const target = clampRandom(randomValue) * totalWeight
  let cursor = 0
  for (const action of candidates) {
    cursor += action.weight
    if (target < cursor) return action.id
  }
  return candidates[candidates.length - 1].id
}

export async function playIdleVideoSafely(play: () => Promise<void>) {
  try {
    await play()
    return null
  } catch (reason) {
    return reason
  }
}

type TimerHandle = ReturnType<typeof setTimeout>

interface IdleAnimationSchedulerOptions {
  clearTimer?: (timer: TimerHandle) => void
  onPlay: (action: IdleNurseAction) => void
  onPrepare: (action: IdleNurseAction) => void
  random?: () => number
  setTimer?: (callback: () => void, delay: number) => TimerHandle
}

export class IdleAnimationScheduler {
  private enabled = false
  private lastAction: IdleNurseAction | null = null
  private playing = false
  private preparedAction: IdleNurseAction | null = null
  private timer: TimerHandle | null = null

  private readonly clearTimer: (timer: TimerHandle) => void
  private readonly onPlay: (action: IdleNurseAction) => void
  private readonly onPrepare: (action: IdleNurseAction) => void
  private readonly random: () => number
  private readonly setTimer: (callback: () => void, delay: number) => TimerHandle

  constructor(options: IdleAnimationSchedulerOptions) {
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer))
    this.onPlay = options.onPlay
    this.onPrepare = options.onPrepare
    this.random = options.random ?? Math.random
    this.setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay))
  }

  start() {
    if (this.enabled) return
    this.enabled = true
    this.scheduleFreshWait()
  }

  stop() {
    this.enabled = false
    this.playing = false
    this.preparedAction = null
    this.clearPendingTimer()
  }

  reset() {
    this.stop()
    this.lastAction = null
    this.start()
  }

  completeAction() {
    if (!this.enabled || !this.playing) return
    this.playing = false
    this.scheduleFreshWait()
  }

  skipPreparedAction() {
    if (!this.enabled) return
    this.clearPendingTimer()
    if (this.preparedAction) this.lastAction = this.preparedAction
    this.preparedAction = null
    this.playing = false
    this.scheduleFreshWait()
  }

  private clearPendingTimer() {
    if (this.timer === null) return
    this.clearTimer(this.timer)
    this.timer = null
  }

  private scheduleFreshWait() {
    if (!this.enabled || this.playing || this.timer !== null) return
    const action = selectIdleNurseAction(this.lastAction, this.random())
    if (!action) return

    this.preparedAction = action
    this.onPrepare(action)
    const delay = nextIdleNurseDelay(this.random())
    this.timer = this.setTimer(() => {
      this.timer = null
      if (!this.enabled || this.preparedAction !== action) return
      this.preparedAction = null
      this.lastAction = action
      this.playing = true
      this.onPlay(action)
    }, delay)
  }
}
