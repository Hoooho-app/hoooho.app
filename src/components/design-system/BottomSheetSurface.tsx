import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export interface BottomSheetSurfaceProps {
  children: ReactNode
  className?: string
  footer?: ReactNode
  label: string
  leading?: ReactNode
  navigation?: ReactNode
  onClose: () => void
  open: boolean
  size?: 'default' | 'workspace'
  title: string
}

export function BottomSheetSurface({ children, className = '', footer, label, leading, navigation, onClose, open, size = 'default', title }: BottomSheetSurfaceProps) {
  const sheetRef = useRef<HTMLElement>(null)
  usePageScrollLock(open)
  useDialogFocus(open, sheetRef)

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
      <section aria-label={label} aria-modal="true" className={`hoho-bottom-sheet ${className}`} data-size={size} ref={sheetRef} role="dialog" tabIndex={-1}>
        <div aria-hidden="true" className="hoho-bottom-sheet__handle" />
        <header className="hoho-bottom-sheet__header">
          <div className="hoho-bottom-sheet__title-group">{leading}<h2 className="hoho-text-section-title">{title}</h2></div>
          <button aria-label={`关闭${label}`} className="hoho-bottom-sheet__close" onClick={onClose} type="button">
            <X size={21} strokeWidth={1.8} />
          </button>
        </header>
        {navigation && <div className="hoho-bottom-sheet__navigation">{navigation}</div>}
        <div className="hoho-bottom-sheet__body">{children}</div>
        {footer && <footer className="hoho-bottom-sheet__footer">{footer}</footer>}
      </section>
    </div>
  )
}
