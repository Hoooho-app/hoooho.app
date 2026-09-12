const prefix = 'hoooho:trigger-card:v1:'

export type TriggerCardStatus = 'dismissed' | 'completed'

function storageKey(accountId: string, memberId: string, cardId: string, cycle: string) {
  return `${prefix}${accountId}:${memberId}:${cardId}:${cycle}`
}

export function readTriggerCardStatus(accountId: string, memberId: string, cardId: string, cycle: string): TriggerCardStatus | null {
  try {
    const exact = localStorage.getItem(storageKey(accountId, memberId, cardId, cycle)) as TriggerCardStatus | null
    if (exact) return exact
    const suffix = `:${memberId}:${cardId}:${cycle}`
    const migrated = Object.keys(localStorage).find((key) => key.startsWith(prefix) && key.endsWith(suffix))
    if (!migrated) return null
    const value = localStorage.getItem(migrated) as TriggerCardStatus | null
    if (value) localStorage.setItem(storageKey(accountId, memberId, cardId, cycle), value)
    return value
  } catch { return null }
}

export function setTriggerCardStatus(accountId: string, memberId: string, cardId: string, cycle: string, status: TriggerCardStatus) {
  try { localStorage.setItem(storageKey(accountId, memberId, cardId, cycle), status) } catch { /* Optional browser persistence. */ }
}

export const triggerSuggestionKey = 'hoooho:journal-suggestion'

export function completeCurrentTriggerSuggestion() {
  try {
    const value = JSON.parse(sessionStorage.getItem(triggerSuggestionKey) ?? 'null') as { accountId?: string; memberId?: string; cardId?: string; cycle?: string } | null
    if (value?.accountId && value.memberId && value.cardId && value.cycle) setTriggerCardStatus(value.accountId, value.memberId, value.cardId, value.cycle, 'completed')
  } catch { /* An invalid suggestion must not block saving. */ }
}
