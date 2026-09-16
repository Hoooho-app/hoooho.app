import type { ComponentProps } from 'react'
import { HohoButton } from '../../components/design-system'

type ManualRecordButtonProps = Omit<ComponentProps<typeof HohoButton>, 'children' | 'size' | 'variant'>

export function ManualRecordButton({ className = '', onClick: _onClick, ...props }: ManualRecordButtonProps) {
  return (
    <HohoButton
      {...props}
      aria-label="记录"
      className={`journal-manual-record-action ${className}`.trim()}
      size="large"
      variant="secondary"
      onClick={() => window.location.assign('/health-events/continuous/new')}
    >
      <span aria-hidden="true" className="journal-manual-record-action__visual">
        <span className="journal-manual-record-action__plus">＋</span>
        <span className="journal-manual-record-action__label">记录</span>
      </span>
    </HohoButton>
  )
}
