type SessionRecoveryHandler = () => Promise<string | null>

let handler: SessionRecoveryHandler | undefined
let pending: Promise<string | null> | undefined

export function registerSessionRecoveryHandler(next: SessionRecoveryHandler) {
  handler = next
}

export function recoverSessionToken() {
  if (!handler) return Promise.resolve(null)
  if (pending) return pending
  pending = handler().finally(() => { pending = undefined })
  return pending
}
