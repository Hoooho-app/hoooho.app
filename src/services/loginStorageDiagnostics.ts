// Only booleans/enums leave the browser. This helper never sends stored values.
export function loginStorageDiagnostics(storage: Pick<Storage, 'getItem'>) {
  try {
    const preference = storage.getItem('rememberLoginPreference')
    return {
      'X-Hoooho-Nickname-Storage': storage.getItem('lastLoginNickname') ? 'present' : 'absent',
      'X-Hoooho-Remember-Preference': preference === 'false' ? 'false' : preference === 'true' ? 'true' : 'unset'
    }
  } catch {
    return { 'X-Hoooho-Nickname-Storage': 'unavailable', 'X-Hoooho-Remember-Preference': 'unavailable' }
  }
}

export function browserLoginStorageDiagnostics() {
  // Accessing localStorage itself can throw before getItem is called.
  try { return loginStorageDiagnostics(localStorage) }
  catch { return loginStorageDiagnostics({ getItem() { throw new Error('Storage unavailable') } }) }
}
