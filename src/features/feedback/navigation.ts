export interface FeedbackSource { path: string; name: string; scrollY?: number }
export interface FeedbackNavigationState { feedbackSource?: FeedbackSource }

const unsafe = /^(?:\/feedback(?:\/|$)|\/login(?:\/|$)|\/onboarding(?:\/|$)|\/ops(?:\/|$))/

export function isSafeFeedbackReturn(path: unknown): path is string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false
  return !unsafe.test(path)
}

export function makeFeedbackState(path: string, name: string, scrollY = 0): FeedbackNavigationState {
  return { feedbackSource: { path, name: name.trim().slice(0, 100) || '上一页', scrollY: Math.max(0, Math.round(scrollY)) } }
}

export function resolveFeedbackSource(state: unknown, persisted: FeedbackSource | null, wasReload: boolean): FeedbackSource {
  const source = (state as FeedbackNavigationState | null)?.feedbackSource
  if (source && isSafeFeedbackReturn(source.path)) return source
  if (wasReload && persisted && isSafeFeedbackReturn(persisted.path)) return persisted
  return { path: '/settings', name: '我的', scrollY: 0 }
}
