// Server-only configuration. Do not import this module into browser code.
export class SafeAIProviderError extends Error {
  constructor(message, code) { super(message); this.status = 503; this.code = code; this.publicAIMessage = message }
}
export const configurationError = (message, code = 'AI_CONFIGURATION_INVALID') => new SafeAIProviderError(message, code)

export function boundedSetting(env, name, fallback, min, max) {
  if (env[name] === undefined || env[name] === '') return fallback
  const value = Number(env[name])
  if (!Number.isInteger(value) || value < min || value > max) throw configurationError(`${name} 必须是 ${min}–${max} 范围内的整数`)
  return value
}

export function selectedProvider(env = process.env) {
  const value = env.AI_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'local')
  if (!['openai', 'bailian', 'local'].includes(value)) throw configurationError('AI_PROVIDER 只支持 openai、bailian、local')
  return value
}

export function bailianConfiguration(options = {}) {
  const env = options.env ?? process.env
  const apiKey = options.apiKey ?? env.BAILIAN_API_KEY
  const raw = options.baseUrl ?? env.BAILIAN_BASE_URL
  if (!apiKey || !raw) throw configurationError('百炼尚未配置：请在后端填写 BAILIAN_API_KEY 与 BAILIAN_BASE_URL，仍可手动记录', 'AI_NOT_CONFIGURED')
  let url
  try { url = new URL(raw) } catch { throw configurationError('BAILIAN_BASE_URL 必须是控制台提供的完整 OpenAI 兼容地址') }
  const beijing = /^[a-z0-9-]+\.cn-beijing\.maas\.aliyuncs\.com$/i.test(url.hostname) || url.hostname === 'dashscope.aliyuncs.com'
  if (url.protocol !== 'https:' || !beijing || url.port || url.username || url.password || url.search || url.hash || !/^\/compatible-mode\/v1\/?$/.test(url.pathname)) {
    throw configurationError('BAILIAN_BASE_URL 必须是北京地域 HTTPS 兼容 Base URL，以 /compatible-mode/v1 结尾；不要粘贴 API Host、原生接口或 /chat/completions', 'AI_BASE_URL_INVALID')
  }
  const model = options.model ?? env.BAILIAN_MODEL ?? 'qwen3.7-plus'
  const visionModel = options.visionModel ?? env.BAILIAN_VISION_MODEL ?? model
  if (![model, visionModel].every(value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(value))) throw configurationError('百炼模型变量格式无效')
  return {
    apiKey, baseUrl: url.href.replace(/\/$/, ''), model, visionModel,
    timeoutMs: boundedSetting(env, 'BAILIAN_TIMEOUT_MS', 60000, 1000, 120000),
    maxOutputTokens: boundedSetting(env, 'BAILIAN_MAX_OUTPUT_TOKENS', 8000, 3000, 16000),
    maxImages: boundedSetting(env, 'BAILIAN_MAX_IMAGES_PER_REQUEST', 1, 1, 12),
    maxInputCharacters: boundedSetting(env, 'BAILIAN_MAX_INPUT_CHARACTERS', 65000, 1000, 120000),
  }
}
