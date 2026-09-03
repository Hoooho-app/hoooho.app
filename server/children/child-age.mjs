function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  if (!match) return null
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return date.getUTCFullYear() === parts.year && date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day ? parts : null
}

export function ageInCompletedMonths(birthday, occurredAt) {
  const birth = dateParts(birthday)
  const occurrence = dateParts(occurredAt)
  if (!birth || !occurrence) return null
  let months = (occurrence.year - birth.year) * 12 + occurrence.month - birth.month
  if (occurrence.day < birth.day) months -= 1
  return months < 0 ? null : months
}

export function isChildUnderSeven(birthday, at = new Date()) {
  const months = ageInCompletedMonths(birthday, at instanceof Date ? at.toISOString() : at)
  return months !== null && months < 84
}

export function formatChildAgeAt(birthday, occurredAt = new Date()) {
  const months = ageInCompletedMonths(birthday, occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt)
  if (months === null) return '年龄未填写'
  if (months < 1) return '未满1个月'
  if (months < 12) return `${months}个月`
  if (months < 36) return `${Math.floor(months / 12)}岁${months % 12}个月`
  return `${Math.floor(months / 12)}岁`
}
