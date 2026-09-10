import { Plus } from 'lucide-react'
import type { ComponentProps } from 'react'
import { HohoButton } from '../../components/design-system'

type ManualRecordButtonProps = Omit<ComponentProps<typeof HohoButton>, 'children' | 'size' | 'variant'>

export function ManualRecordButton({ className = '', ...props }: ManualRecordButtonProps) {
  return (
    <HohoButton
      {...props}
      aria-label="记一下"
      className={`journal-manual-record-action ${className}`.trim()}
      size="large"
      variant="secondary"
    >
      <span aria-hidden="true" className="journal-manual-record-action__visual">
        <Plus className="journal-manual-record-action__icon" size={22} strokeWidth={2} />
        <span className="journal-manual-record-action__label">记一下</span>
      </span>
    </HohoButton>
  )
}
