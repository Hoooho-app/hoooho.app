import { WandSparkles } from 'lucide-react'
import { HohoButton } from './HohoButton'
import type { HohoButtonProps } from './HohoButton'

export type MedicalPrepButtonProps = Omit<HohoButtonProps, 'children'> & { wordmark?: boolean }

export function MedicalPrepButton({ className = '', disabled = false, wordmark = false, ...props }: MedicalPrepButtonProps) {
  return (
    <HohoButton
      {...props}
      className={`medical-prep-button ${className}`.trim()}
      disabled={disabled}
    >
      <span aria-hidden="true" className="medical-prep-button__soft-glow" />
      <span aria-hidden="true" className="medical-prep-button__light-band" />
      <span aria-hidden="true" className={`medical-prep-button__icon${wordmark ? ' medical-prep-button__icon--wordmark' : ''}`}>
        {wordmark ? <span className="medical-prep-button__wordmark">Hoooho</span> : <WandSparkles size={15} strokeWidth={1.8} />}
      </span>
      <span className="medical-prep-button__label">就医准备</span>
    </HohoButton>
  )
}
