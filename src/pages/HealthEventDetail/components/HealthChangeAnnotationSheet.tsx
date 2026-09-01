import { Check } from 'lucide-react'
import { BottomSheetSurface, HohoButton } from '../../../components/design-system'
import type { HealthChangeAnnotationApiDto, HealthChangeType } from '../../../types'

const choices: Array<{ type: HealthChangeType; label: string }> = [
  { type: 'new', label: '新出现' },
  { type: 'worsened', label: '加重' },
  { type: 'improved', label: '减轻' },
  { type: 'resolved', label: '已消失' }
]

export const healthChangeTypeLabel: Record<HealthChangeType, string> = Object.fromEntries(
  choices.map((choice) => [choice.type, choice.label])
) as Record<HealthChangeType, string>

export function HealthChangeAnnotationSheet({ annotation, busy, error, onClose, onDelete, onSelect }: {
  annotation: HealthChangeAnnotationApiDto | null
  busy: boolean
  error: string
  onClose: () => void
  onDelete: () => Promise<void>
  onSelect: (changeType: HealthChangeType) => Promise<void>
}) {
  return (
    <BottomSheetSurface className="health-change-sheet" label="修改变化标签" onClose={onClose} open={Boolean(annotation)} title={annotation ? `${annotation.factLabel}的变化` : '修改变化标签'}>
      {annotation && <div className="health-change-sheet__content">
        <div aria-label={`${annotation.factLabel}的变化`} className="health-change-sheet__choices" role="radiogroup">
          {choices.map((choice) => {
            const selected = annotation.changeType === choice.type
            return <button aria-checked={selected} disabled={busy} key={choice.type} onClick={() => void onSelect(choice.type)} role="radio" type="button"><span>{choice.label}</span>{selected && <Check aria-hidden="true" size={19} />}</button>
          })}
        </div>
        {error && <p aria-live="polite" className="health-change-sheet__error">{error}</p>}
        <HohoButton disabled={busy} onClick={() => void onDelete()} variant="ghost">删除这个标签</HohoButton>
      </div>}
    </BottomSheetSurface>
  )
}
