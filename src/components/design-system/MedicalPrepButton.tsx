import { HohoButton } from './HohoButton'
import { HooohoIcon } from './HooohoIcon'
import type { HohoButtonProps } from './HohoButton'

export type MedicalPrepButtonProps = Omit<HohoButtonProps, 'children'>

export function MedicalPrepButton({ className = '', disabled = false, ...props }: MedicalPrepButtonProps) {
  const accessibleLabel = props['aria-label'] ?? '就医准备'
  return (
    <HohoButton
      {...props}
      aria-label={accessibleLabel}
      className={`medical-prep-button ${className}`.trim()}
      disabled={disabled}
    >
      <span aria-hidden="true" className="medical-prep-button__icon">
        <HooohoIcon className="medical-prep-button__report-icon" name="medical-note" size={24} />
      </span>
      <span className="medical-prep-button__label">
        <strong>就诊情况单</strong>
        <small>孩子情况快速整理</small>
      </span>
    </HohoButton>
  )
}
