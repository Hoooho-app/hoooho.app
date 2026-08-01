import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  interactive?: boolean
}

export function Card({ children, interactive, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-card border bg-surface p-4 shadow-card ${interactive ? 'transition hover:-translate-y-0.5 hover:shadow-floating' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
