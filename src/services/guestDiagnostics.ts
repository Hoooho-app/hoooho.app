const storageKey = 'hoooho-guest-diagnostic'
const maxAgeMs = 48 * 60 * 60 * 1000

type StoredDiagnostic = { id: string; createdAt: number }

function createId() {
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function initializeGuestDiagnostic() {
  try {
    const query = new URLSearchParams(location.search)
    if (query.get('guest-diagnostic') === '1') {
      const existing = readGuestDiagnostic()
      if (existing) return existing
      const created = { id: createId(), createdAt: Date.now() }
      localStorage.setItem(storageKey, JSON.stringify(created))
      return created.id
    }
    return readGuestDiagnostic()
  } catch { return '' }
}

export function readGuestDiagnostic() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as StoredDiagnostic | null
    if (!value || !/^[a-f0-9]{30}$/.test(value.id) || Date.now() - value.createdAt > maxAgeMs) return ''
    return value.id
  } catch { return '' }
}

export async function recordGuestDiagnostic(event: string, details: Record<string, string | boolean> = {}) {
  const diagnosticTestId = readGuestDiagnostic()
  if (!diagnosticTestId) return
  try {
    await fetch('/api/auth/diagnostics', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Hoooho-Diagnostic-ID': diagnosticTestId },
      body: JSON.stringify({ event, diagnosticTestId, clientBuildCommit: frontendBuild.commit, serviceWorkerVersion: frontendBuild.commit, ...details })
    })
  } catch { /* Diagnostics must never alter authentication behavior. */ }
}

export const frontendBuild = {
  commit: import.meta.env?.VITE_BUILD_COMMIT ?? 'test',
  timestamp: import.meta.env?.VITE_BUILD_TIMESTAMP ?? 'test',
  authProtocolVersion: 'account-id-v1'
}
