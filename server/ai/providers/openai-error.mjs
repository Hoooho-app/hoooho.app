// Provider responses can echo submitted content. Keep only these diagnostic fields;
// never retain the response, request, credentials, or arbitrary upstream prose.
const safeMessages = [
  'You exceeded your current quota, please check your plan and billing details.',
  'Your organization has no prepaid credits remaining.',
  'Your organization reached its enforced spend limit.',
  'Your project reached its enforced spend limit.',
  'Your organization reached its OpenAI-assigned usage limit.',
  'The free tier of the model has been exhausted.', 'Invalid API-key provided.', 'Incorrect API key provided.'
]

function safeMessage(value) {
  if (typeof value !== 'string') return null
  const message = safeMessages.find((sentence) => value.startsWith(sentence))
  if (message) return message
  if (/^Rate limit reached\b/.test(value)) return 'Rate limit reached. [upstream details redacted]'
  return '[REDACTED_UPSTREAM_MESSAGE]'
}

function safeCode(value) {
  if (typeof value !== 'string') return null
  if (['InvalidApiKey', 'InvalidAPIKey', 'AccessDenied', 'AccessDenied.Unpurchased', 'Model.AccessDenied', 'Workspace.AccessDenied', 'Endpoint.AccessDenied', 'AllocationQuota.FreeTierOnly', 'AllocationQuota', 'Throttling', 'Throttling.RateQuota', 'Throttling.AllocationQuota', 'ModelNotFound', 'WorkSpaceNotFound', 'InvalidParameter', 'InternalError.Algo.InvalidParameter', 'InvalidImageFormat', 'InvalidImageResolution', 'InvalidFile.ImageSize', 'InvalidFile.Resolution', 'Arrearage', 'InsufficientBalance', 'DataInspectionFailed'].includes(value)) return value
  return /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : null
}

function safeRetryAfter(value) {
  if (typeof value !== 'string') return null
  if (/^\d{1,10}$/.test(value)) return value
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)
    && Number.isFinite(Date.parse(value))) return value
  return null
}

function classify(code, type, message) {
  const kinds = {
    credit_balance_exhausted: 'credit_balance',
    project_spend_limit_exceeded: 'project_spend_limit',
    organization_spend_limit_exceeded: 'organization_spend_limit',
    organization_usage_limit_exceeded: 'organization_usage_limit',
    rate_limit_exceeded: 'rate_limit',
    slow_down: 'rate_limit',
    InvalidApiKey: 'authentication', InvalidAPIKey: 'authentication', invalid_api_key: 'authentication',
    AccessDenied: 'permission', access_denied: 'permission', 'AccessDenied.Unpurchased': 'permission', 'Model.AccessDenied': 'permission', 'Workspace.AccessDenied': 'permission', 'Endpoint.AccessDenied': 'permission', WorkSpaceNotFound: 'permission',
    'AllocationQuota.FreeTierOnly': 'free_quota_exhausted', AllocationQuota: 'quota_unknown', 'Throttling.AllocationQuota': 'quota_unknown',
    Throttling: 'rate_limit', 'Throttling.RateQuota': 'rate_limit', ModelNotFound: 'model_not_found', model_not_found: 'model_not_found',
    Arrearage: 'credit_balance', InsufficientBalance: 'credit_balance', InvalidImageFormat: 'image_unavailable', InvalidImageResolution: 'image_unavailable', 'InvalidFile.ImageSize': 'image_unavailable', 'InvalidFile.Resolution': 'image_unavailable'
  }
  if (Object.hasOwn(kinds, code)) return kinds[code]
  // Inspect only known provider error wording transiently; never keep URL,
  // submitted content, or the unredacted message in diagnostics.
  if (['InvalidParameter','InternalError.Algo.InvalidParameter'].includes(code) && typeof message === 'string' && /^(?:Failed to (?:download|fetch|decode).*image|Invalid image|Image.*(?:invalid|download|unavailable)|Wrong Content-Type of multimodal url)/i.test(message)) return 'image_unavailable'
  if (code === 'insufficient_quota' || type === 'insufficient_quota') return 'quota_unknown'
  if (type === 'rate_limit_error') return 'rate_limit'
  return 'provider_error'
}

export function safeOpenAIErrorDetails(value = {}) {
  const errorCode = safeCode(value.errorCode)
  const errorType = safeCode(value.errorType)
  return {
    httpStatus: Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? value.httpStatus : null,
    errorType,
    errorCode,
    errorMessage: safeMessage(value.errorMessage),
    requestId: typeof value.requestId === 'string' && /^(?:req_[A-Za-z0-9_-]{1,100}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|chatcmpl-[a-zA-Z0-9_-]{1,100})$/.test(value.requestId) ? value.requestId : null,
    retryAfter: safeRetryAfter(value.retryAfter),
    failureKind: value.failureKind === 'image_unavailable' && ['InvalidParameter','InternalError.Algo.InvalidParameter'].includes(errorCode) ? 'image_unavailable' : classify(errorCode, errorType, value.errorMessage)
  }
}

export function safeOpenAIFailureCodes(error) {
  const providerCodes = ['AI_SUMMARY_PROVIDER_ERROR', 'EMPTY_AI_SUMMARY', 'INVALID_AI_SUMMARY', 'AI_NOT_CONFIGURED']
  const transportCodes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_PRX_TLS', 'CERT_HAS_EXPIRED',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
    'ERR_SSL_WRONG_VERSION_NUMBER', 'ABORT_ERR']
  const code = error?.cause?.code ?? error?.code
  return {
    providerCode: providerCodes.includes(error?.code) ? error.code : null,
    transportCode: transportCodes.includes(code) ? code
      : (error?.name === 'TimeoutError' ? 'TIMEOUT' : error?.name === 'AbortError' ? 'ABORTED' : null)
  }
}

export async function readOpenAIErrorDetails(response) {
  let error, body
  try {
    body = await response.json()
    error = body?.error ?? body
  } catch {
    // Non-JSON responses and parse failures must not enter logs or Error.cause.
  }
  return safeOpenAIErrorDetails({
    httpStatus: response.status,
    errorType: error?.type,
    errorCode: error?.code,
    errorMessage: error?.message,
    requestId: response.headers?.get('x-request-id') ?? response.headers?.get('x-dashscope-request-id') ?? body?.request_id,
    retryAfter: response.headers?.get('retry-after')
  })
}
