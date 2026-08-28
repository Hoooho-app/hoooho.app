import type { HTMLAttributes, ReactNode } from 'react'

export type HealthTagTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'error'

export interface HealthTagProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  tone?: HealthTagTone
}

export function HealthTag({ children, tone = 'neutral', className = '', ...props }: HealthTagProps) {
  return (
    <span className={`hoho-health-tag ${className}`} data-tone={tone} {...props}>
      {children}
    </span>
  )
}
