// Keep result order while bounding browser decoding and upload work. On failure,
// drain work already started before returning so it cannot mutate the next turn.
export async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, task: (item: T, index: number) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('Concurrency must be a positive integer')
  signal?.throwIfAborted()
  const results = new Array<R>(items.length)
  let next = 0, failed = false, failure: unknown
  const worker = async () => {
    while (!failed && next < items.length) {
      try {
        signal?.throwIfAborted()
        const index = next++
        results[index] = await task(items[index], index)
      } catch (error) {
        if (!failed) { failed = true; failure = error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  if (failed) throw failure
  signal?.throwIfAborted()
  return results
}
