import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'

export interface BottomSheetSurfaceProps {
  children: ReactNode
  footer?: ReactNode
  label: string
  onClose: () => void
  open: boolean
  title: string
}

export function BottomSheetSurface({ children, footer, label, onClose, open, title }: BottomSheetSurfaceProps) {
  usePageScrollLock(open)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="hoho-bottom-sheet-layer" role="presentation">
      <button aria-label={`关闭${label}`} className="hoho-bottom-sheet-backdrop" onClick={onClose} type="button" />
      <section aria-label={label} aria-modal="true" className="hoho-bottom-sheet" role="dialog">
        <div aria-hidden="true" className="hoho-bottom-sheet__handle" />
        <header className="hoho-bottom-sheet__header">
          <h2 className="hoho-text-section-title">{title}</h2>
          <button aria-label={`关闭${label}`} className="hoho-bottom-sheet__close" onClick={onClose} type="button">
            <X size={21} strokeWidth={1.8} />
          </button>
        </header>
        <div className="hoho-bottom-sheet__body">{children}</div>
        {footer && <footer className="hoho-bottom-sheet__footer">{footer}</footer>}
      </section>
    </div>
  )
}
