import { ChevronRight } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'

export interface HohoSurfaceRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  action?: ReactNode
  description?: ReactNode
  leading?: ReactNode
  onActivate?: () => void
  title: ReactNode
  value?: ReactNode
}

export function HohoSurfaceRow({ action, className = '', description, leading, onActivate, title, value, ...props }: HohoSurfaceRowProps) {
  const content = <>
    {leading}
    <span className="min-w-0 flex-1">
      <strong className="hoho-text-body block font-medium text-[rgb(var(--hoho-color-text-primary))]">{title}</strong>
      {description && <span className="hoho-text-caption mt-0.5 block truncate">{description}</span>}
    </span>
    {value && <span className="hoho-text-caption max-w-40 truncate">{value}</span>}
    {action ?? (onActivate ? <ChevronRight aria-hidden="true" className="shrink-0 text-[rgb(var(--hoho-color-text-weak))]" size={18} /> : null)}
  </>

  return onActivate
    ? <button className={`hoho-surface-row ${className}`} type="button" onClick={onActivate}>{content}</button>
    : <div className={`hoho-surface-row ${className}`} {...props}>{content}</div>
}
