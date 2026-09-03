import { useCallback, useEffect, useRef } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { HohoButton } from './HohoButton'
import { ModalSurface } from './ModalSurface'

export interface ConfirmDialogProps {
  cancelLabel?: string
  confirmLabel: string
  danger?: boolean
  description: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  title: string
}

export function ConfirmDialog({ cancelLabel = '取消', confirmLabel, danger = false, description, loading = false, onCancel, onConfirm, open, title }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancel = useCallback(() => {
    if (!loading) onCancel()
  }, [loading, onCancel])
  usePageScrollLock(open)
  useDialogFocus(open, dialogRef)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && cancel()
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [cancel, open])

  if (!open) return null
  return <div className="fixed inset-0 z-[70] grid place-items-center px-5" role="presentation">
    <button aria-label={`关闭${title}`} className="absolute inset-0 bg-text-primary/35" onClick={cancel} type="button" />
    <ModalSurface className="relative p-5" label={title} ref={dialogRef} tabIndex={-1}>
      <h2 className="hoho-text-section-title">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <HohoButton disabled={loading} variant="secondary" onClick={cancel}>{cancelLabel}</HohoButton>
        <HohoButton loading={loading} variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</HohoButton>
      </div>
    </ModalSurface>
  </div>
}
