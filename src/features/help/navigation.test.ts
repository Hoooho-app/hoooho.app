import test from 'node:test'
import assert from 'node:assert/strict'
import { helpReturnOptions, makeHelpState, readHelpOrigin, safeHelpSource } from './navigation'
test('help sources preserve safe date/search routes only for the original account and child', () => {
  const path = '/health-events?day=2026-10-25&type=sleep#records'
  const state = makeHelpState(path, 'account-a', 'child-a')
  const origin = readHelpOrigin(state, 'account-a', 'child-a')
  assert.equal(origin?.path, path)
  assert.equal(readHelpOrigin(state, 'account-b', 'child-a'), null)
  assert.equal(readHelpOrigin(state, 'account-a', 'child-b'), null)
  for (const unsafe of ['//other.test', '/help?article=sleep', '/login', '/ops', '/care-handoff', '/family/new', '/nurse-station\\evil', '/nurse-station\n']) assert.equal(safeHelpSource(unsafe), false)
  assert.deepEqual(helpReturnOptions(origin).state, { conversationOwner: { accountId:'account-a', memberId:'child-a' } })
  assert.equal(helpReturnOptions(null).state, null)
})
