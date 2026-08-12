import type { HTMLAttributes, ReactNode } from 'react'

export interface ModalSurfaceProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  label: string
}

export function ModalSurface({ children, className = '', label, ...props }: ModalSurfaceProps) {
  return <section aria-label={label} aria-modal="true" className={`hoho-modal-surface ${className}`} role="dialog" {...props}>{children}</section>
}
