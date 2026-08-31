import { useEffect, useRef } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { HohoButton, ModalSurface } from '../design-system'

interface FamilyEditorConfirmDialogProps {
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

export function FamilyEditorConfirmDialog({ cancelLabel = '继续编辑', confirmLabel, danger = false, description, loading = false, onCancel, onConfirm, open, title }: FamilyEditorConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  usePageScrollLock(open)
  useDialogFocus(open, dialogRef)

  useEffect(() => {
    if (!open || loading) return
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [loading, onCancel, open])

  if (!open) return null
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-text-primary/35 px-5" role="presentation">
    <ModalSurface className="p-5" label={title} ref={dialogRef} tabIndex={-1}>
      <h2 className="hoho-text-section-title">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <HohoButton disabled={loading} variant="secondary" onClick={onCancel}>{cancelLabel}</HohoButton>
        <HohoButton loading={loading} variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</HohoButton>
      </div>
    </ModalSurface>
  </div>
}
