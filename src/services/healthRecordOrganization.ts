export interface HealthRecordOrganizationRequest {
  eventId: string
  recordId: string
  rawInput: string
}

export interface HealthRecordOrganizationResult {
  status: 'reserved'
  rawInput: string
  aiOutput: null
  confirmedData: null
}

/**
 * AI 整理能力的前端边界。当前版本只保留 RawInput，并明确分离尚未生成的
 * AIOutput 与 ConfirmedData。未来接入真实服务时只替换此实现。
 */
export async function requestHealthRecordOrganization(
  request: HealthRecordOrganizationRequest
): Promise<HealthRecordOrganizationResult> {
  return {
    status: 'reserved',
    rawInput: request.rawInput,
    aiOutput: null,
    confirmedData: null
  }
}
