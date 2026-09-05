// Single byte ranges cover browser MP4 probing and resumed downloads. Ignore
// malformed/multipart headers; a valid but unsatisfiable range returns 416.
export function mediaRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!match || (!match[1] && !match[2])) return null
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return false
  return { start, end }
}
