import { WandSparkles } from 'lucide-react'
import logoWhiteUrl from '../../assets/brand/logo-white.svg'
import { HohoButton } from './HohoButton'
import type { HohoButtonProps } from './HohoButton'

export type MedicalPrepButtonProps = Omit<HohoButtonProps, 'children'> & { brandMark?: boolean }

export function MedicalPrepButton({ brandMark = false, className = '', disabled = false, ...props }: MedicalPrepButtonProps) {
  return (
    <HohoButton
      {...props}
      className={`medical-prep-button ${className}`.trim()}
      disabled={disabled}
    >
      <span aria-hidden="true" className="medical-prep-button__soft-glow" />
      <span aria-hidden="true" className="medical-prep-button__light-band" />
      <span aria-hidden="true" className="medical-prep-button__icon">
        {brandMark ? <img alt="" height={18} src={logoWhiteUrl} width={18} /> : <WandSparkles size={15} strokeWidth={1.8} />}
      </span>
      <span className="medical-prep-button__label">就医准备</span>
    </HohoButton>
  )
}
