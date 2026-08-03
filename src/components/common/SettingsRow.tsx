import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

interface SettingsRowProps {
  title: string
  description?: string
  value?: string
  action?: ReactNode
  onClick?: () => void
}

export function SettingsRow({ title, description, value, action, onClick }: SettingsRowProps) {
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-medium">{title}</strong>
        {description && <span className="mt-0.5 block truncate text-xs text-text-secondary">{description}</span>}
      </span>
      {value && <span className="max-w-40 truncate text-xs text-text-secondary">{value}</span>}
      {action ?? (onClick ? <ChevronRight className="shrink-0 text-text-secondary" size={18} strokeWidth={1.7} /> : null)}
    </>
  )

  const classes = 'flex min-h-16 w-full items-center gap-3 rounded-[16px] bg-surface px-4 py-3 text-left shadow-card'
  return onClick ? <button className={`${classes} transition active:scale-[0.99]`} type="button" onClick={onClick}>{content}</button> : <div className={classes}>{content}</div>
}
