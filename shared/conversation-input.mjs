// Ignore invisible formatting only for the emptiness check. Punctuation,
// emoji, numbers, units and the exact submitted original remain meaningful.
export const hasVisibleConversationText = value => typeof value === 'string' && Boolean(value.replace(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, ''))
export const hasConversationInput = ({text,files,voiceFiles,assetIds} = {}) => hasVisibleConversationText(text) || [files,voiceFiles,assetIds].some(items => Array.isArray(items) && items.length > 0)
