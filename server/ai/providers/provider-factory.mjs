import { OpenAIProvider } from './openai-provider.mjs'
import { BailianProvider } from './bailian-provider.mjs'
import { selectedProvider, configurationError } from './provider-config.mjs'

export function createAIProvider(options = {}) {
  try {
    const selected = selectedProvider(options.env)
    if (selected === 'local') return null
    return selected === 'bailian' ? new BailianProvider(options) : new OpenAIProvider(options)
  } catch (error) {
    // Invalid AI configuration must not prevent manual records or local export.
    // Explicit AI generation fails clearly; it never silently switches supplier.
    const reject = async () => { throw error }
    return { name: 'unconfigured', apiKey: null, model: null, organize: reject, analyzeImage: reject, summarizeMedicalPreparation: reject, fetch: reject, configurationError: error }
  }
}

export function createAudioProvider(kind, options = {}) {
  const env = options.env ?? process.env
  let selected
  try { selected = env[`${kind}_PROVIDER`] ?? (selectedProvider(env) === 'openai' ? 'openai' : 'none') } catch { return null }
  if (selected === 'none') return null
  if (selected === 'openai') return env.OPENAI_API_KEY || options.apiKey ? new OpenAIProvider(options) : null
  const reject = async () => { throw configurationError(`${kind}_PROVIDER 尚不支持该语音供应商；请继续文字记录`, `${kind}_NOT_CONFIGURED`) }
  return { name: 'unconfigured', transcribeAudio: reject, fetch: reject, configurationError: configurationError(`${kind}_PROVIDER 只支持 none 或 openai`) }
}
