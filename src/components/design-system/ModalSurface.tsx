import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

export interface ModalSurfaceProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  label: string
}

export const ModalSurface = forwardRef<HTMLElement, ModalSurfaceProps>(function ModalSurface({ children, className = '', label, ...props }, ref) {
  return <section aria-label={label} aria-modal="true" className={`hoho-modal-surface ${className}`} ref={ref} role="dialog" {...props}>{children}</section>
})
