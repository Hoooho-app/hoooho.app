const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
const dayMs = 86_400_000

export function beijingDate(at) {
  const parts = Object.fromEntries(calendar.formatToParts(at).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function isExpiryDate(value) {
  if (typeof value !== 'string' || !/^[2-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function expiryCountdown(date, exactAt, now, renewal = false) {
  if (!isExpiryDate(date)) return { label: '—', tone: 'unknown' }
  const days = (Date.parse(date) - Date.parse(beijingDate(now))) / dayMs
  if (days < 0) return { label: renewal ? `已过续订日 ${-days} 天` : `已到期 ${-days} 天`, tone: 'expired' }
  if (days === 0 && exactAt && Date.parse(exactAt) <= now.getTime()) return { label: renewal ? '已过续订时间' : '已到期', tone: 'expired' }
  if (days === 0) return { label: renewal ? '今天续订' : '今天到期', tone: 'expired' }
  return { label: `还剩 ${days} 天`, tone: days <= 7 ? 'urgent' : days <= 30 ? 'soon' : 'normal' }
}
