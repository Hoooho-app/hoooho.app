import { Mic } from 'lucide-react'

interface QuickRecordTriggerProps {
  className?: string
  disabled?: boolean
  onClick: () => void
}

export function QuickRecordTrigger({ className = '', disabled = false, onClick }: QuickRecordTriggerProps) {
  return (
    <button
      className={`quick-record-trigger ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Mic aria-hidden="true" size={18} />
      快捷记录
    </button>
  )
}
