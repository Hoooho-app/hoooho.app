export type SleepRange = { source: string; start: number; end: number; ongoing: boolean }
export type SleepSegment = SleepRange & { first: boolean; last: boolean }
type Item = { kind: string; activity?: string; key: string; sortTime: number; hour: number; minute: number; sleepRange?: SleepRange; sleepSegment?: SleepSegment }

// Display-only compression: original records, routine instances and interval times stay unchanged.
export function compactSleepTimeline<T extends Item>(items: T[]): T[] {
  const groups = new Map<string, T>()
  for (const item of items) if (item.activity === 'sleep' && item.sleepRange) {
    const source = item.sleepRange.source
    if (!groups.has(source)) groups.set(source, item)
  }
  const ranges = [...groups.values()].map(item => item.sleepRange!)
  const result = items.filter(item => !(item.activity === 'sleep' && item.sleepRange)
    && !(item.kind === 'hour-divider' && ranges.some(range => item.sortTime >= range.start && item.sortTime <= range.end)))
  for (const [source, item] of groups) {
    const range = item.sleepRange!
    const cuts = [...new Set(items.filter(candidate => candidate.kind !== 'hour-divider'
      && candidate.activity !== 'sleep' && candidate.sortTime > range.start && candidate.sortTime < range.end)
      .map(candidate => candidate.sortTime))].sort((a, b) => a - b)
    const boundaries = [range.start, ...cuts, range.end]
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index], end = boundaries[index + 1], at = new Date(start)
      result.push({ ...item, key: `${source}:segment:${start}:${end}`, sortTime: (start + end) / 2,
        hour: at.getHours(), minute: at.getMinutes(), sleepSegment: { start, end, ongoing: range.ongoing, first: index === 0, last: index === boundaries.length - 2 } })
    }
  }
  return result
}
