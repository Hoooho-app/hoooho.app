import type { ReactNode } from 'react'

type TagTone = 'primary' | 'success' | 'warning' | 'neutral'
const tones: Record<TagTone, string> = {
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  neutral: 'bg-background text-text-secondary'
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: TagTone }) {
  return <span className={`inline-flex rounded-pill px-3 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>
}
