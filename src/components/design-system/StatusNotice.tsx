import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

export type StatusNoticeTone = 'info' | 'success' | 'warning' | 'error'

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle
}

export function StatusNotice({ action, children, title, tone = 'info' }: { action?: ReactNode; children?: ReactNode; title: ReactNode; tone?: StatusNoticeTone }) {
  const Icon = icons[tone]
  return <section aria-live={tone === 'error' ? 'assertive' : 'polite'} className="hoho-status-notice" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
    <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={18} strokeWidth={1.8} />
    <div className="min-w-0 flex-1"><strong className="hoho-text-card-title block">{title}</strong>{children && <div className="hoho-text-caption mt-1">{children}</div>}</div>
    {action}
  </section>
}
