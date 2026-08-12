import { Eye } from 'lucide-react'
import { HohoButton, HohoSection } from '../../../components/design-system'

export function ObservationSection({ onStart }: { onStart: () => void }) {
  return (
    <HohoSection
      description="持续记录当前事件中值得关注的变化。"
      title="观察"
    >
      <div className="flex items-center justify-between gap-4 rounded-card border bg-surface px-4 py-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <Eye size={21} strokeWidth={1.8} />
        </span>
        <p className="hoho-text-caption min-w-0 flex-1">设置记录方式和关注重点，后续可持续补充变化。</p>
        <HohoButton className="shrink-0" onClick={onStart} variant="secondary">开始观察</HohoButton>
      </div>
    </HohoSection>
  )
}
