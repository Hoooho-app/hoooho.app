import logoWhiteUrl from '../../assets/brand/logo-white.svg'
import { HohoButton } from './HohoButton'
import type { HohoButtonProps } from './HohoButton'

export type MedicalPrepButtonProps = Omit<HohoButtonProps, 'children'>

export function MedicalPrepButton({ className = '', disabled = false, ...props }: MedicalPrepButtonProps) {
  return (
    <HohoButton
      {...props}
      className={`medical-prep-button ${className}`.trim()}
      disabled={disabled}
    >
      <span aria-hidden="true" className="medical-prep-button__icon">
        <img alt="" height={14} src={logoWhiteUrl} width={14} />
      </span>
      <span className="medical-prep-button__label">就医准备</span>
    </HohoButton>
  )
}
