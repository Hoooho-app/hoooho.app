import test from 'node:test'
import assert from 'node:assert/strict'
import { clearHelpLessonReceipt, helpLessonFromReturnPath, helpLessonFromSearch, readHelpLessonReceipt, readHelpSleepDraft, saveHelpLessonReceipt, saveHelpSleepDraft } from './guidedRecord'

test('tutorial results and unfinished sleep stay with their account and child, even when storage is blocked', () => {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } } })
  try {
    const receipt = { eventId: 'event-one', recordId: 'record-one', savedAt: '2026-10-30T00:00:00Z' }
    saveHelpLessonReceipt('account-one', 'child-one', 'symptom', receipt)
    assert.deepEqual(readHelpLessonReceipt('account-one', 'child-one', 'symptom'), receipt)
    assert.equal(readHelpLessonReceipt('account-two', 'child-one', 'symptom'), null)
    assert.equal(readHelpLessonReceipt('account-one', 'child-two', 'symptom'), null)
    assert.equal(readHelpLessonReceipt('account-one', 'child-one', 'sleep'), null)
    const draft = { sleepAt: '2026-10-28T13:30:00Z', wakeAt: '2026-10-28T23:00:00Z', durationMinutes: 570, kind: 'night' as const, status: 'completed' as const, observations: [] }
    saveHelpSleepDraft('account-one', 'child-one', draft)
    assert.deepEqual(readHelpSleepDraft('account-one', 'child-one'), draft)
    assert.equal(readHelpSleepDraft('account-two', 'child-one'), null)
    assert.equal(readHelpSleepDraft('account-one', 'child-two'), null)
    saveHelpLessonReceipt('account-one', 'child-one', 'sleep', receipt)
    assert.equal(readHelpSleepDraft('account-one', 'child-one'), null)
    clearHelpLessonReceipt('account-one', 'child-one', 'symptom')
    assert.equal(readHelpLessonReceipt('account-one', 'child-one', 'symptom'), null)
  } finally { Reflect.deleteProperty(globalThis, 'sessionStorage') }
})

test('login continuation accepts only the two actual recording tutorials', () => {
  assert.equal(helpLessonFromReturnPath('/health-events?helpTutorial=sleep&day=2026-10-29'), 'sleep')
  assert.equal(helpLessonFromReturnPath('/health-events?helpTutorial=symptom'), 'symptom')
  for (const value of ['//example.test/health-events?helpTutorial=sleep', 'https://example.test/health-events?helpTutorial=sleep', '/account/nickname?helpTutorial=sleep', '/health-events?helpTutorial=tasks']) assert.equal(helpLessonFromReturnPath(value), null)
  assert.equal(helpLessonFromSearch('?helpTutorial=symptom&recordId=pretend'), 'symptom')
  assert.equal(readHelpLessonReceipt('account-url', 'child-url', 'symptom'), null)
})
