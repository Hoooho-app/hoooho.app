export const APP_HOME_PATH = '/nurse-station'

export interface MemberProfileEditOrigin {
  memberId: string
  reopenMemberProfileSheet: true
  returnState: Record<string, unknown> | null
  returnTo: string
  scrollY: number
  source: 'member-profile-sheet'
}

export interface MemberProfileNavigationState {
  memberProfileEditOrigin?: MemberProfileEditOrigin
  memberProfileRestore?: MemberProfileEditOrigin
}

const browserLoadedEditRoute = typeof window !== 'undefined'
  && (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'
  && /^\/family\/[^/]+\/edit$/.test(window.location.pathname)

export function getCurrentPath(pathname: string, search: string, hash: string) {
  return `${pathname}${search}${hash}`
}

export function isSafeReturnPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/family')
}

export function readMemberProfileEditOrigin(state: unknown, memberId: string) {
  const origin = (state as MemberProfileNavigationState | null)?.memberProfileEditOrigin
  if (!origin || origin.source !== 'member-profile-sheet' || origin.memberId !== memberId || !origin.reopenMemberProfileSheet || !isSafeReturnPath(origin.returnTo)) return null
  return browserLoadedEditRoute ? null : origin
}

export function readMemberProfileRestore(state: unknown) {
  const restore = (state as MemberProfileNavigationState | null)?.memberProfileRestore
  return restore?.source === 'member-profile-sheet' && restore.reopenMemberProfileSheet && isSafeReturnPath(restore.returnTo) ? restore : null
}

export function consumeMemberProfileRestore(state: unknown) {
  if (!state || typeof state !== 'object') return null
  const next = { ...(state as Record<string, unknown>) }
  delete next.memberProfileRestore
  return Object.keys(next).length ? next : null
}

export function makeMemberProfileRestoreState(origin: MemberProfileEditOrigin) {
  return { ...(origin.returnState ?? {}), memberProfileRestore: origin }
}

export function makeMemberProfileOpenState(memberId: string, returnTo: string, returnState: Record<string, unknown> | null, scrollY: number) {
  const origin: MemberProfileEditOrigin = {
    source: 'member-profile-sheet', memberId, returnTo, returnState,
    reopenMemberProfileSheet: true, scrollY
  }
  return makeMemberProfileRestoreState(origin)
}
