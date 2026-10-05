export function journalOccurrenceAt(journal: { sleep?: { status?: string; sleepAt?: string; wakeAt?: string }; diet?: { status?: string; startedAt?: string; endedAt?: string } } | null | undefined, fallback: string): string
export function compactDuration(minutes: number): string
