export const WELCOME_SEEN_KEY = 'hoooho:welcome:seen:v1'

// Storage can be unavailable in private/embedded browsers. Keep the current
// document usable even then; this preference never participates in auth.
let seenInThisDocument = false

export function hasSeenWelcome() {
  if (seenInThisDocument) return true
  try { return localStorage.getItem(WELCOME_SEEN_KEY) === 'true' }
  catch { return false }
}

export function completeWelcome() {
  seenInThisDocument = true
  try { localStorage.setItem(WELCOME_SEEN_KEY, 'true') }
  catch { /* Starting must still open the existing login form. */ }
}
