type AIOperation = 'smart-record' | 'medical-summary' | 'audio-transcription' | 'recognition-job' | 'food-label' | 'product-help' | 'feedback-interview' | 'nurse-dialogue'
type Outcome = 'ready' | 'needs_review' | 'failed' | 'cancelled'

// No text, URLs, member identity or media enter telemetry. This reports the
// actual start-to-readable-result wall time, separately from provider timing.
export function startAITiming(operation: AIOperation, token: string, traceId: string = crypto.randomUUID()) {
  const started = performance.now()
  let finished = false
  return {
    traceId,
    finish(outcome: Outcome) {
      if (finished) return
      finished = true
      const elapsedMs = Math.round(performance.now() - started)
      if (!token || elapsedMs < 0 || elapsedMs > 600000) return
      void fetch('/api/ai/telemetry', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Hoooho-Trace-Id': traceId },
        body: JSON.stringify({ traceId, operation, elapsedMs, outcome })
      }).catch(() => undefined)
    }
  }
}
