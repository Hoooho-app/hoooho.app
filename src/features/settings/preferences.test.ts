import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultAccountPreferences,
  defaultCarePreferences,
  getAccountPreferences,
  getCareRootAttributes,
  nextCareModePreferences
} from './preferences'

test('account preferences are isolated by the real account id', () => {
  const accounts = {
    'account-a': {
      ...defaultAccountPreferences,
      homeDefaultView: { mode: 'member' as const, memberId: 'member-a' },
      recordSubjectBehavior: 'remember-last' as const
    }
  }

  assert.deepEqual(getAccountPreferences(accounts, 'account-a').homeDefaultView, { mode: 'member', memberId: 'member-a' })
  assert.deepEqual(getAccountPreferences(accounts, 'account-b'), defaultAccountPreferences)
})

test('care mode applies defaults once and preserves detailed choices after disabling', () => {
  const firstEnabled = nextCareModePreferences(defaultCarePreferences, true)
  const customized = { ...firstEnabled, textSize: 'extra-large' as const, reduceMotion: true }
  const disabled = nextCareModePreferences(customized, false)
  const enabledAgain = nextCareModePreferences(disabled, true)

  assert.equal(firstEnabled.hasConfigured, true)
  assert.equal(disabled.enabled, false)
  assert.equal(enabledAgain.textSize, 'extra-large')
  assert.equal(enabledAgain.reduceMotion, true)
})

test('root attributes only activate detailed care settings while care mode is enabled', () => {
  assert.deepEqual(getCareRootAttributes(defaultCarePreferences), {
    careMode: 'false',
    careContrast: 'false',
    careHints: 'false',
    careMotion: 'standard',
    carePlain: 'false',
    careSimplify: 'false',
    careTargets: 'false',
    careTerms: 'false',
    careText: 'standard'
  })

  const active = getCareRootAttributes({ ...defaultCarePreferences, enabled: true, hasConfigured: true, reduceMotion: true })
  assert.equal(active.careMode, 'true')
  assert.equal(active.careContrast, 'true')
  assert.equal(active.careMotion, 'reduce')
  assert.equal(active.carePlain, 'true')
  assert.equal(active.careTargets, 'true')
  assert.equal(active.careTerms, 'true')
  assert.equal(active.careText, 'large')
})
