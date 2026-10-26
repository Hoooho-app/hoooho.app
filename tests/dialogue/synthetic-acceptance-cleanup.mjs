// No network client or credentials are owned here. `api` has the acceptance
// harness signature: api(route, method = 'GET', body, timeoutMs).
// The caller still owns logout and its account-level credential cleanup.
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200
const segment = value => encodeURIComponent(value)
const ownedBy = (value, accountId) => value?.accountId == null || value.accountId === accountId
const eventRoute = id => `/api/events/${segment(id)}`
const recordsRoute = id => `${eventRoute(id)}/records`

async function absent(api, route) {
  try { await api(route, 'GET', undefined, 15000); return false }
  catch (error) { if (error?.status === 404) return true; throw error }
}

/**
 * Clean only one freshly created, harness-owned member.
 *
 * Every scoped event and every record is checked before the first DELETE.
 * A failed deletion/empty check keeps its parent event. Any failure keeps the
 * member, so an operator can retry without destroying the recovery path.
 *
 * eventRecordsEmpty/eventsGone include the confirmed zero-event case.
 * No logout is performed or returned: merge these fields into the script's
 * cleanup report, then let the script populate its existing `logout` field.
 */
export async function cleanupSyntheticMember({api, memberId, accountId, fullRaw, draftId, saveAttempted = false}) {
  const result = {
    recordsDeleted: 0,
    eventsDeleted: 0,
    eventRecordsEmpty: false,
    eventsGone: false,
    memberDeleted: false,
    memberGone: false,
    complete: false,
  }
  if (typeof api !== 'function' || !identifier(memberId) || !identifier(accountId)) return result
  const memberRoute = `/api/members/${segment(memberId)}`
  const scopedEvents = async () => {
    const events = await api('/api/events', 'GET', undefined, 15000)
    if (!Array.isArray(events)) throw new Error('Invalid event list')
    const selected = events.filter(event => event?.memberId === memberId)
    if (selected.some(event => !identifier(event.id) || !ownedBy(event, accountId)) ||
        new Set(selected.map(event => event.id)).size !== selected.length) throw new Error('Invalid scoped events')
    return selected
  }

  let planned, initialMemberGone = false
  try {
    const events = await scopedEvents()
    // Without an attempted save, even a matching source must not authorize
    // deleting unexpected formal data.
    if (!saveAttempted && events.length) return result
    try {
      const member = await api(memberRoute, 'GET', undefined, 15000)
      if (member?.id !== memberId || !ownedBy(member, accountId)) return result
    } catch (error) {
      if (error?.status !== 404) throw error
      initialMemberGone = true
      result.memberGone = true
      if (events.length) return result
    }
    if (events.length && (typeof fullRaw !== 'string' || !identifier(draftId))) return result
    const seenRecords = new Set()
    planned = []
    for (const listed of events) {
      const event = await api(eventRoute(listed.id), 'GET', undefined, 15000)
      if (event?.id !== listed.id || event.memberId !== memberId || !ownedBy(event, accountId)) return result
      const records = await api(recordsRoute(event.id), 'GET', undefined, 15000)
      if (!Array.isArray(records)) return result
      for (const record of records) {
        if (!identifier(record?.id) || !ownedBy(record, accountId) ||
            (record.eventId != null && record.eventId !== event.id) ||
            record.sourceText !== fullRaw || record.aiProvenance?.draftId !== draftId ||
            seenRecords.has(record.id)) return result
        seenRecords.add(record.id)
      }
      planned.push({eventId: event.id, records, deletionFailed: false})
    }
  } catch { return result }

  // Only the fully validated plan is now eligible for mutation.
  let failed = false, allRecordsEmpty = true, allEventsGone = true
  for (const plan of planned) {
    for (const record of plan.records) {
      try {
        const response = await api(`/api/records/${segment(record.id)}`, 'DELETE', {}, 20000)
        if (response?.success !== true) throw new Error('Record deletion unconfirmed')
        result.recordsDeleted++
      } catch { plan.deletionFailed = true; failed = true }
    }
  }
  for (const plan of planned) {
    let empty = false
    try {
      const remaining = await api(recordsRoute(plan.eventId), 'GET', undefined, 15000)
      if (!Array.isArray(remaining) || remaining.length) throw new Error('Records not empty')
      empty = true
    } catch { allRecordsEmpty = false; failed = true }
    // A failed DELETE is a failed cleanup even if its response was lost and a
    // later read happens to be empty. Keep the parent for explicit recovery.
    if (plan.deletionFailed || !empty) { allEventsGone = false; continue }
    try {
      const response = await api(eventRoute(plan.eventId), 'DELETE', {}, 20000)
      if (response?.success !== true) throw new Error('Event deletion unconfirmed')
      result.eventsDeleted++
      if (!await absent(api, eventRoute(plan.eventId)) || !await absent(api, recordsRoute(plan.eventId))) {
        throw new Error('Event absence unconfirmed')
      }
    } catch { allEventsGone = false; failed = true }
  }
  // This final scan also catches an extra event from a delayed/duplicate save.
  // Never adopt and delete a newly appeared object without a fresh preflight.
  try {
    if ((await scopedEvents()).length) {
      allRecordsEmpty = false
      allEventsGone = false
      failed = true
    }
  } catch { allEventsGone = false; failed = true }
  result.eventRecordsEmpty = allRecordsEmpty
  result.eventsGone = allEventsGone
  if (failed) return result
  if (initialMemberGone) { result.complete = true; return result }
  try {
    const response = await api(memberRoute, 'DELETE', {}, 20000)
    if (response?.success !== true) throw new Error('Member deletion unconfirmed')
    result.memberDeleted = true
    result.memberGone = await absent(api, memberRoute)
    result.complete = result.memberGone
  } catch { /* Keep complete=false; the caller reports cleanup failure. */ }
  return result
}
