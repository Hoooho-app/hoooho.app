import { isProductPathVisible } from '../../../shared/product-visibility.mjs'
export interface HelpOrigin { path: string; accountId: string; memberId: string }
const allowed = new Set(['/nurse-station', '/health-events', '/health-events/search', '/health-calendar', '/health-profile', '/health-profile/basic', '/health-profile/growth', '/health-profile/allergy', '/visit-summary', '/recent-review', '/account', '/settings', '/about', '/feedback'])
export function safeHelpSource(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return false
  const path = value.split(/[?#]/)[0]
  return allowed.has(path) && isProductPathVisible(path)
}
export function makeHelpState(path: string, accountId: string, memberId: string) {
  return safeHelpSource(path) ? { helpOrigin: { path, accountId, memberId } } : null
}
export function readHelpOrigin(state: unknown, accountId: string, memberId: string): HelpOrigin | null {
  const origin = (state as { helpOrigin?: HelpOrigin } | null)?.helpOrigin
  return origin && origin.accountId === accountId && origin.memberId === memberId && safeHelpSource(origin.path) ? origin : null
}
export function helpReturnOptions(origin: HelpOrigin | null) {
  return { replace: true, state: origin ? { conversationOwner: { accountId: origin.accountId, memberId: origin.memberId } } : null }
}
