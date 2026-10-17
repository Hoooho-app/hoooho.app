import test from 'node:test'
import assert from 'node:assert/strict'
import { organizeBackTarget, organizeNavigationState, readOrganizeOrigin } from './navigation.ts'
test('home, calendar query and original route state survive contextual back and reload', () => {
  for (const pathname of ['/nurse-station', '/health-events']) {
    const state = organizeNavigationState({ pathname, search: '?month=2026-10', hash: '#records', state: { selected: 'record' } }, 2)
    assert.deepEqual(organizeBackTarget(state, 3), { delta: -1 })
    assert.deepEqual(organizeBackTarget(state, 0), { path: pathname + '?month=2026-10#records', state: { selected: 'record' } })
  }
})
test('direct entry falls home, direct event links retain prior page and unsafe origins cannot redirect outside the app', () => {
  assert.deepEqual(organizeBackTarget(null, 0), { path: '/nurse-station', state: null })
  assert.deepEqual(organizeBackTarget(null, 4), { delta: -1 })
  for (const returnTo of ['//outside.example', '/\\outside.example', '/visit-summary', '/care-handoff?x=1', '/recent-review']) assert.equal(readOrganizeOrigin({ organizeOrigin: { returnTo } }), null)
})
