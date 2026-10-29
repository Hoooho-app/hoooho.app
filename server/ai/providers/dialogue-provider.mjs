import { createAIProvider } from './provider-factory.mjs'

// Preserve the existing Bailian conversation default. Only an explicit
// OpenRouter selection changes it; missing config never falls back to Qwen.
export function createDialogueProvider(options = {}) {
  const env = options.env ?? process.env
  return createAIProvider({ ...options, env: { ...env, AI_PROVIDER: env.AI_PROVIDER === 'openrouter' ? 'openrouter' : 'bailian' } })
}
