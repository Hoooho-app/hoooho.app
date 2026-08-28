import assert from 'node:assert/strict'
import test from 'node:test'
import { mapBrowserPermissionState } from './permissions'

test('browser permission states are mapped without inventing an allowed status', () => {
  assert.equal(mapBrowserPermissionState('granted'), 'granted')
  assert.equal(mapBrowserPermissionState('denied'), 'denied')
  assert.equal(mapBrowserPermissionState('prompt'), 'prompt')
  assert.equal(mapBrowserPermissionState('unknown'), 'unsupported')
})
