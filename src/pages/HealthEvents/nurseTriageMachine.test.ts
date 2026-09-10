import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canStartNurseHandoff,
  DEFAULT_HEALTH_EVENTS_VIEW_MODE,
  healthEventsViewLabels,
  transitionNurseTriage,
  type NurseTriageState
} from './nurseTriageMachine.ts'

test('健康事件查看方式保持既有默认入口', () => {
  assert.equal(DEFAULT_HEALTH_EVENTS_VIEW_MODE, 'triage')
  assert.deepEqual(healthEventsViewLabels, { triage: '前台视图', list: '时间视图' })
})

test('护士导诊主流程经过聆听、核对、保存并停留在已记下', () => {
  let state: NurseTriageState = 'idle'
  const actions = ['start', 'attentionComplete', 'microphoneReady', 'speechPaused', 'speechResumed', 'finishSpeaking', 'confirmSave', 'saveSucceeded'] as const
  actions.forEach((action) => { state = transitionNurseTriage(state, action) })
  assert.equal(state, 'saved')
})

test('录音、核对和保存期间不允许换班', () => {
  const protectedStates: NurseTriageState[] = ['attention', 'preparing', 'listening', 'speechPaused', 'reviewing', 'awaitingConfirmation', 'saving']
  protectedStates.forEach((state) => {
    assert.equal(canStartNurseHandoff(state), false)
    assert.equal(transitionNurseTriage(state, 'handoffStarted'), state)
  })
  assert.equal(canStartNurseHandoff('idle'), true)
  assert.equal(canStartNurseHandoff('saved'), true)
})
