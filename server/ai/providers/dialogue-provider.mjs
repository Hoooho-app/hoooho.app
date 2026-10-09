import { createAIProvider } from './provider-factory.mjs'

// Conversation roles share the existing Beijing Bailian adapter. No alternate
// supplier is selected if configuration is missing or an upstream call fails.
export function createDialogueProvider(options = {}) {
  return createAIProvider({ ...options, env: { ...(options.env ?? process.env), AI_PROVIDER: 'bailian' } })
}
