import type { ComponentProps } from 'react'
import { Plus } from 'lucide-react'
import { HohoButton } from '../../components/design-system'

type ManualRecordButtonProps = Omit<ComponentProps<typeof HohoButton>, 'children' | 'size' | 'variant'>

export function ManualRecordButton({ className = '', onClick, ...props }: ManualRecordButtonProps) {
  return (
    <HohoButton
      {...props}
      aria-label="记录"
      className={`journal-manual-record-action ${className}`.trim()}
      size="large"
      variant="secondary"
      onClick={onClick}
    >
      <span aria-hidden="true" className="journal-manual-record-action__visual">
        <Plus />
        <span className="journal-manual-record-action__label">记录</span>
      </span>
    </HohoButton>
  )
}
