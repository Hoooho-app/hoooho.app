type SessionRecoveryHandler = () => Promise<string | null>

let handler: SessionRecoveryHandler | undefined
let generation = 0
let pending: { generation: number; promise: Promise<string | null> } | undefined

export function registerSessionRecoveryHandler(next: SessionRecoveryHandler) {
  handler = next
}

export function invalidateSessionRecoveryRequests() {
  generation += 1
  pending = undefined
}

export function recoverSessionToken() {
  if (!handler) return Promise.resolve(null)
  if (pending?.generation === generation) return pending.promise
  const requestGeneration = generation
  const promise = handler()
    .then((token) => requestGeneration === generation ? token : null)
    .finally(() => {
      if (pending?.promise === promise) pending = undefined
    })
  pending = { generation: requestGeneration, promise }
  return promise
}
