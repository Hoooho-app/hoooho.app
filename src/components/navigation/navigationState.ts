export interface FamilyEntryState {
  returnTo: string
  reopenDrawer: boolean
}

export interface FamilyLocationState {
  familyEntry?: FamilyEntryState
}

export interface MemberSwitchResultState {
  memberSwitchResult?: {
    memberName: string
    reopenDrawer: boolean
  }
}

export function getCurrentPath(pathname: string, search: string, hash: string) {
  return `${pathname}${search}${hash}`
}

export function isSafeReturnPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/family')
}
