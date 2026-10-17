// Schedule from completion, not setInterval: a slow request must never overlap
// the next poll. Pausing aborts its HTTP request; starting again is idempotent.
export function createSerialPoller(task: (signal: AbortSignal) => Promise<void>, intervalMs = 2000) {
  let stopped = false, paused = true, running = false
  let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  const poll = async () => {
    if (stopped || paused || running) return
    clear(); running = true
    controller = new AbortController()
    try { await task(controller.signal) } catch { /* The caller owns error presentation; the next cycle can retry. */ }
    finally {
      running = false; controller = undefined
      if (!stopped && !paused) timer = setTimeout(() => void poll(), intervalMs)
    }
  }
  return {
    start() { if (stopped) return; paused = false; void poll() },
    pause() { paused = true; clear(); controller?.abort() },
    stop() { stopped = true; paused = true; clear(); controller?.abort() },
  }
}
