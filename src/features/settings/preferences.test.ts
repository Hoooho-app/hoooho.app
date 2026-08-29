import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultAccountPreferences,
  defaultCarePreferences,
  getAccountPreferences,
  getCareRootAttributes,
  nextCareModePreferences
} from './preferences'

test('account preferences use supported defaults for an unknown account', () => {
  const accounts = { 'account-a': { ...defaultAccountPreferences } }
  assert.deepEqual(getAccountPreferences(accounts, 'account-b'), defaultAccountPreferences)
})

test('legacy account fields are ignored without changing supported preferences', () => {
  const obsoleteHomePreference = ['home', 'Default', 'View'].join('')
  const obsoleteRecordPreference = ['record', 'Subject', 'Behavior'].join('')
  const accounts = {
    'account-a': {
      interfaceLanguage: 'zh-CN' as const,
      [obsoleteHomePreference]: { mode: 'all' },
      [obsoleteRecordPreference]: 'confirm'
    }
  }

  const preferences = getAccountPreferences(accounts, 'account-a')
  assert.deepEqual(preferences, { interfaceLanguage: 'zh-CN' })
  assert.equal(Object.hasOwn(preferences, obsoleteHomePreference), false)
  assert.equal(Object.hasOwn(preferences, obsoleteRecordPreference), false)
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
