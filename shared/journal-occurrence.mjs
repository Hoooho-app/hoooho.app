// One actual occurrence. Plans and audit timestamps never determine completion.
export function journalOccurrenceAt(journal, fallback) {
  const sleep = journal?.sleep
  if (sleep) return sleep.status === 'ongoing' ? sleep.sleepAt || fallback : sleep.wakeAt || sleep.sleepAt || fallback
  const diet = journal?.diet
  if (diet?.startedAt) return diet.status === 'ongoing' ? diet.startedAt : diet.endedAt || diet.startedAt
  return fallback
}

export function compactDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  return minutes < 60 ? `${Math.max(1, Math.round(minutes))}分钟` : `约${Math.max(1, Math.round(minutes / 60))}小时`
}
