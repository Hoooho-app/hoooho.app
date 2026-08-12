import type { HTMLAttributes, ReactNode } from 'react'
import { HealthCard } from '../design-system'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  interactive?: boolean
}

export function Card({ children, interactive, className = '', ...props }: CardProps) {
  return <HealthCard className={className} interactive={interactive} {...props}>{children}</HealthCard>
}
