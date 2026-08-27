export function countVisibleSummaryTags(widths: readonly number[], containerWidth: number, gap = 8) {
  if (containerWidth <= 0) return 0
  let occupied = 0
  let count = 0
  for (const width of widths) {
    const next = occupied + (count ? gap : 0) + width
    if (next > containerWidth) break
    occupied = next
    count += 1
  }
  return count
}
