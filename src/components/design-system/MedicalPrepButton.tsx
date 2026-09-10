import { ClipboardList } from 'lucide-react'
import { HohoButton } from './HohoButton'
import type { HohoButtonProps } from './HohoButton'

export type MedicalPrepButtonProps = Omit<HohoButtonProps, 'children'> & {
  icon?: 'brand' | 'report'
}

export function MedicalPrepButton({ className = '', disabled = false, icon = 'brand', ...props }: MedicalPrepButtonProps) {
  const accessibleLabel = props['aria-label'] ?? '就医准备'
  return (
    <HohoButton
      {...props}
      aria-label={accessibleLabel}
      className={`medical-prep-button ${className}`.trim()}
      disabled={disabled}
    >
      <span aria-hidden="true" className="medical-prep-button__icon">
        {icon === 'report' ? <ClipboardList className="medical-prep-button__report-icon" size={16} strokeWidth={1.9} /> : (
          <svg fill="none" height="14" viewBox="0 0 80 80" width="14" xmlns="http://www.w3.org/2000/svg">
            <path d="M 13 65 Q 40 28 67 13" stroke="rgba(255,255,255,0.55)" strokeLinecap="round" strokeWidth="2.6" />
            <circle className="medical-prep-button__dot medical-prep-button__dot--bottom" cx="13" cy="65" fill="#FFFFFF" r="6" />
            <circle className="medical-prep-button__dot medical-prep-button__dot--middle" cx="40" cy="38" fill="#FFFFFF" r="11" />
            <circle className="medical-prep-button__dot medical-prep-button__dot--top" cx="67" cy="13" fill="#FFFFFF" r="8" />
          </svg>
        )}
      </span>
      <span className="medical-prep-button__label">
        <strong>就诊情况单</strong>
        <small>孩子情况快速整理</small>
      </span>
    </HohoButton>
  )
}
