import logoUrl from '../../assets/logo.svg'
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
      <span aria-hidden="true" className="medical-prep-button__glow" />
      <span aria-hidden="true" className="medical-prep-button__icon">
        <img alt="" height={20} src={logoUrl} width={20} />
        <i className="medical-prep-button__spark medical-prep-button__spark--one" />
        <i className="medical-prep-button__spark medical-prep-button__spark--two" />
      </span>
      <span className="medical-prep-button__label">就医准备</span>
    </HohoButton>
  )
}
