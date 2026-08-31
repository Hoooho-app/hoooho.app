import { emptyHealthAIOutput, projectOrganizedHealthData } from './ai-types.mjs'

export const QUICK_RECORD_STRUCTURED_MODE_ENABLED = 'enabled'
export const QUICK_RECORD_STRUCTURED_MODE_DISABLED = 'disabled'

export function readQuickRecordStructuredMode(value = process.env.QUICK_RECORD_STRUCTURED_MODE) {
  return value === QUICK_RECORD_STRUCTURED_MODE_ENABLED
    ? QUICK_RECORD_STRUCTURED_MODE_ENABLED
    : QUICK_RECORD_STRUCTURED_MODE_DISABLED
}

export function isQuickRecordStructuredModeEnabled(value) {
  return readQuickRecordStructuredMode(value) === QUICK_RECORD_STRUCTURED_MODE_ENABLED
}

export function isUnconfirmedQuickRecordOrganization(organization) {
  return Boolean(organization?.previewId) && !organization?.confirmedData
}

export function redactUnconfirmedQuickRecordOrganization(organization, mode) {
  if (isQuickRecordStructuredModeEnabled(mode) || !isUnconfirmedQuickRecordOrganization(organization)) return organization
  const healthAIOutput = emptyHealthAIOutput()
  return {
    ...organization,
    healthAIOutput,
    organizedHealthData: projectOrganizedHealthData(healthAIOutput),
    rawRecordOnly: true,
    structuredMode: QUICK_RECORD_STRUCTURED_MODE_DISABLED
  }
}
