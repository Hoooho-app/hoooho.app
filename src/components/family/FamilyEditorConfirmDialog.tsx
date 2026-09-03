import { ConfirmDialog } from '../design-system'

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
  return <ConfirmDialog cancelLabel={cancelLabel} confirmLabel={confirmLabel} danger={danger} description={description} loading={loading} onCancel={onCancel} onConfirm={onConfirm} open={open} title={title} />
}
