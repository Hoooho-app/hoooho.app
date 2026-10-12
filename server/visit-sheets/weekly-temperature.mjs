import { buildVisitSheet } from './report-model.mjs'
export function shanghaiWeek(now) {
  const local = new Date(now.getTime() + 8 * 3600000)
  const midnight = Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()) - 8 * 3600000
  const from = midnight - ((local.getUTCDay() + 6) % 7) * 86400000
  return {from:new Date(from).toISOString(),to:new Date(from+7*86400000).toISOString()}
}
export function weeklyTemperature(input, now = new Date()) {
  const range = shanghaiWeek(now), owned = new Set(input.events.filter(e => e.memberId === input.member.id && !e.deletedAt).map(e => e.id))
  const records = input.records.filter(r => owned.has(r.eventId) && !r.deletedAt && (!r.memberId || r.memberId === input.member.id))
  const report = buildVisitSheet({...input,records},{},now)
  const byRecord = new Map()
  for (const p of report.chapters.find(c => c.id === 'temperature').blocks.flatMap(b => b.points ?? [])) {
    if (typeof p.value !== 'number' || !Number.isFinite(p.value) || !Number.isFinite(Date.parse(p.at)) || Date.parse(p.at) < Date.parse(range.from) || Date.parse(p.at) >= Date.parse(range.to) || Date.parse(p.at) > now.getTime()) continue
    // A duplicated return (or several facts from one record) is one measurement identity.
    byRecord.set(p.sourceId,{value:p.value,at:p.at,sourceId:p.sourceId})
  }
  return {...range,points:[...byRecord.values()].sort((a,b) => Date.parse(a.at)-Date.parse(b.at) || a.sourceId.localeCompare(b.sourceId))}
}
