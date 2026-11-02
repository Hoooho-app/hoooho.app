import { getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'

export function growthRecordDateBounds(birthday?: string, now = new Date(), timeZone?: string) {
  return { min: birthday && parsePlainDate(birthday) ? birthday : undefined, max: getLocalDateKey(now, timeZone) ?? '' }
}
