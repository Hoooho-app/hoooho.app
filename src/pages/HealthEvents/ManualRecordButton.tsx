import type { ComponentProps } from 'react'
import { HohoButton } from '../../components/design-system'
import { JournalCategoryIcon } from './JournalCategoryIcon'

type ManualRecordButtonProps = Omit<ComponentProps<typeof HohoButton>, 'children' | 'size' | 'variant'>

export function ManualRecordButton({ className = '', onClick: _onClick, ...props }: ManualRecordButtonProps) {
  return (
    <HohoButton
      {...props}
      aria-label="记录症状"
      className={`journal-manual-record-action ${className}`.trim()}
      size="large"
      variant="secondary"
      onClick={() => window.dispatchEvent(new CustomEvent('hoooho:timeline-prompt', { detail: { target: 'symptom' } }))}
    >
      <span aria-hidden="true" className="journal-manual-record-action__visual">
        <JournalCategoryIcon category="symptom" />
        <span className="journal-manual-record-action__label">记录症状</span>
      </span>
    </HohoButton>
  )
}
