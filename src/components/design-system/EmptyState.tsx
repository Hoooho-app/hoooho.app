import type { ReactNode } from 'react'

export interface EmptyStateProps {
  action?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  title: ReactNode
}

export function EmptyState({ action, description, icon, title }: EmptyStateProps) {
  return (
    <section className="hoho-empty-state" aria-live="polite">
      {icon && <span className="hoho-empty-state__icon" aria-hidden="true">{icon}</span>}
      <div>
        <h2 className="hoho-text-section-title">{title}</h2>
        {description && <div className="hoho-text-body mt-2 max-w-72">{description}</div>}
      </div>
      {action}
    </section>
  )
}
