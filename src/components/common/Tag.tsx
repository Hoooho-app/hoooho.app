import type { ReactNode } from 'react'
import { HealthTag } from '../design-system'

type TagTone = 'primary' | 'success' | 'warning' | 'neutral'
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: TagTone }) {
  return <HealthTag tone={tone}>{children}</HealthTag>
}
