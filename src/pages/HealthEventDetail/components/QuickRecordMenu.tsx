import { Mic, PencilLine } from 'lucide-react'
import { BottomSheetSurface, HohoSurfaceRow, Typography } from '../../../components/design-system'

interface QuickRecordMenuProps {
  onClose: () => void
  onManual: () => void
  onVoice: () => void
  open: boolean
}

export function QuickRecordMenu({ onClose, onManual, onVoice, open }: QuickRecordMenuProps) {
  return (
    <BottomSheetSurface label="新增记录" onClose={onClose} open={open} title="新增记录">
      <Typography variant="body">选择一种最顺手的记录方式。</Typography>
      <div className="mt-4 overflow-hidden rounded-card border bg-surface">
        <HohoSurfaceRow description="语音记录，更快更方便" leading={<span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"><Mic size={20} /></span>} onActivate={onVoice} title="说一句" />
        <HohoSurfaceRow description="自己填写记录" leading={<span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"><PencilLine size={20} /></span>} onActivate={onManual} title="手动记录" />
      </div>
    </BottomSheetSurface>
  )
}
