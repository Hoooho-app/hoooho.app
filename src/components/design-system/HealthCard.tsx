import type { HTMLAttributes, ReactNode } from 'react'

export interface HealthCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  interactive?: boolean
}

export function HealthCard({ children, interactive = false, className = '', ...props }: HealthCardProps) {
  return (
    <div
      className={`hoho-health-card ${className}`}
      data-interactive={interactive}
      {...props}
    >
      {children}
    </div>
  )
}
