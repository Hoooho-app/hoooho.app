import { WandSparkles } from 'lucide-react'
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
      <span aria-hidden="true" className="medical-prep-button__soft-glow" />
      <span aria-hidden="true" className="medical-prep-button__light-band" />
      <WandSparkles aria-hidden="true" className="medical-prep-button__icon" size={15} strokeWidth={1.8} />
      <span className="medical-prep-button__label">就医准备</span>
    </HohoButton>
  )
}
