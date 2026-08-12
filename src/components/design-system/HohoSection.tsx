import type { HTMLAttributes, ReactNode } from 'react'

export interface HohoSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  action?: ReactNode
  children: ReactNode
  description?: ReactNode
  title?: ReactNode
}

export function HohoSection({ action, children, className = '', description, title, ...props }: HohoSectionProps) {
  return (
    <section className={`hoho-section ${className}`} {...props}>
      {(title || description || action) && (
        <header className="hoho-section__header">
          <div className="min-w-0 flex-1">
            {title && <h2 className="hoho-text-section-title">{title}</h2>}
            {description && <div className="hoho-text-body mt-1">{description}</div>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
