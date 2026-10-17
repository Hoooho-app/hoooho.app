export const organizeHome = '/nurse-station'
interface Origin { returnTo: string; returnState: unknown; index: number | null }
export function organizeNavigationState(location: { pathname: string; search: string; hash: string; state: unknown }, index: unknown) {
  return { organizeOrigin: { returnTo: `${location.pathname}${location.search}${location.hash}`, returnState: location.state, index: Number.isInteger(index) ? index as number : null } }
}
export function readOrganizeOrigin(state: unknown): Origin | null {
  const origin = (state as { organizeOrigin?: Origin } | null)?.organizeOrigin
  if (!origin || typeof origin.returnTo !== 'string' || !origin.returnTo.startsWith('/') || /^\/\/|[\\\r\n]/.test(origin.returnTo) || /^\/(visit-summary|care-handoff|recent-review)(?:[/?#]|$)/.test(origin.returnTo)) return null
  return { ...origin, index: Number.isInteger(origin.index) ? origin.index : null }
}
export function organizeBackTarget(state: unknown, index: unknown): { delta: -1 } | { path: string; state: unknown } {
  const origin = readOrganizeOrigin(state), current = Number.isInteger(index) ? index as number : 0
  if (origin) return origin.index !== null && current === origin.index + 1 ? { delta: -1 } : { path: origin.returnTo, state: origin.returnState }
  return current > 0 ? { delta: -1 } : { path: organizeHome, state: null }
}
