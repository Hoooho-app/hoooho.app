import assert from 'node:assert/strict'
import test from 'node:test'
import {
  QUICK_RECORD_STRUCTURED_MODE_DISABLED,
  QUICK_RECORD_STRUCTURED_MODE_ENABLED,
  readQuickRecordStructuredMode,
  redactUnconfirmedQuickRecordOrganization
} from './quick-record-structured-mode.mjs'

test('structured quick record mode fails closed unless explicitly enabled', () => {
  assert.equal(readQuickRecordStructuredMode(undefined), QUICK_RECORD_STRUCTURED_MODE_DISABLED)
  assert.equal(readQuickRecordStructuredMode('disabled'), QUICK_RECORD_STRUCTURED_MODE_DISABLED)
  assert.equal(readQuickRecordStructuredMode('ENABLED'), QUICK_RECORD_STRUCTURED_MODE_DISABLED)
  assert.equal(readQuickRecordStructuredMode('enabled'), QUICK_RECORD_STRUCTURED_MODE_ENABLED)
})

test('disabled mode redacts only unconfirmed quick-record facts without mutating stored data', () => {
  const organization = {
    id: 'organization-one',
    previewId: 'preview-one',
    confirmedData: null,
    healthAIOutput: { facts: [{ id: 'fact-one', name: '发热' }] },
    organizedHealthData: { symptoms: [{ content: '发热' }] }
  }
  const redacted = redactUnconfirmedQuickRecordOrganization(organization, 'disabled')
  assert.equal(redacted.rawRecordOnly, true)
  assert.deepEqual(redacted.healthAIOutput.facts, [])
  assert.deepEqual(redacted.organizedHealthData.symptoms, [])
  assert.equal(organization.healthAIOutput.facts.length, 1)
  assert.equal(redactUnconfirmedQuickRecordOrganization(organization, 'enabled'), organization)
  assert.equal(redactUnconfirmedQuickRecordOrganization({ ...organization, confirmedData: { symptoms: [] } }, 'disabled').healthAIOutput.facts.length, 1)
})
