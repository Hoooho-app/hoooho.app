export type CareTextSize = 'standard' | 'large' | 'extra-large'
export type HomeDefaultView = { mode: 'all' } | { mode: 'member'; memberId: string }
export type RecordSubjectBehavior = 'confirm' | 'remember-last'
export type InterfaceLanguage = 'zh-CN'

export interface AccountPreferences {
  homeDefaultView: HomeDefaultView
  interfaceLanguage: InterfaceLanguage
  recordSubjectBehavior: RecordSubjectBehavior
}

export interface CarePreferences {
  enabled: boolean
  explainTerms: boolean
  hasConfigured: boolean
  highContrast: boolean
  largerTargets: boolean
  plainLanguage: boolean
  reduceMotion: boolean
  showActionHints: boolean
  simplifyInformation: boolean
  textSize: CareTextSize
}

export const defaultAccountPreferences: AccountPreferences = {
  homeDefaultView: { mode: 'all' },
  interfaceLanguage: 'zh-CN',
  recordSubjectBehavior: 'confirm'
}

export const defaultCarePreferences: CarePreferences = {
  enabled: false,
  explainTerms: true,
  hasConfigured: false,
  highContrast: true,
  largerTargets: true,
  plainLanguage: true,
  reduceMotion: false,
  showActionHints: true,
  simplifyInformation: true,
  textSize: 'large'
}

export function getAccountPreferences(
  accounts: Record<string, AccountPreferences>,
  accountId: string | null | undefined
): AccountPreferences {
  if (!accountId) return defaultAccountPreferences
  const stored = accounts[accountId]
  return stored
    ? {
        ...defaultAccountPreferences,
        ...stored,
        homeDefaultView: stored.homeDefaultView ?? defaultAccountPreferences.homeDefaultView
      }
    : defaultAccountPreferences
}

export function nextCareModePreferences(current: CarePreferences, enabled: boolean): CarePreferences {
  if (!enabled) return { ...current, enabled: false }
  if (current.hasConfigured) return { ...current, enabled: true }
  return { ...defaultCarePreferences, enabled: true, hasConfigured: true }
}

export function getCareRootAttributes(care: CarePreferences) {
  const active = care.enabled
  return {
    careMode: active ? 'true' : 'false',
    careContrast: active && care.highContrast ? 'true' : 'false',
    careHints: active && care.showActionHints ? 'true' : 'false',
    careMotion: active && care.reduceMotion ? 'reduce' : 'standard',
    carePlain: active && care.plainLanguage ? 'true' : 'false',
    careSimplify: active && care.simplifyInformation ? 'true' : 'false',
    careTargets: active && care.largerTargets ? 'true' : 'false',
    careTerms: active && care.explainTerms ? 'true' : 'false',
    careText: active ? care.textSize : 'standard'
  } as const
}
