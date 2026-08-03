import { useState } from 'react'
import { FileText, Image as ImageIcon, Paperclip } from 'lucide-react'
import type { HealthEvent } from '../../../types'
import { Card } from '../../../components/common'
import { HealthRecordEditorModal } from './HealthRecordEditorModal'

export function AttachmentSection({ event }: { event: HealthEvent }) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  return (
    <section className="space-y-3">
      <h2 className="section-title">附件</h2>
      <Card interactive className="cursor-pointer" onClick={() => setIsEditorOpen(true)} role="button" tabIndex={0}>
        {!event.attachments.length ? (
          <div className="flex items-center gap-3 py-2 text-text-secondary">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"><Paperclip size={18} /></span>
            <div><h3 className="text-sm font-semibold text-text-primary">暂无附件</h3><p className="mt-1 text-xs">可补充照片或就诊资料</p></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {event.attachments.map((attachment) => {
              const Icon = attachment.type === 'image' ? ImageIcon : FileText
              return <div key={attachment.id} className="rounded-[12px] bg-primary-soft/55 p-3"><Icon size={19} className="text-primary" /><p className="mt-3 truncate text-xs font-medium">{attachment.name}</p></div>
            })}
          </div>
        )}
      </Card>
      <HealthRecordEditorModal open={isEditorOpen} templateType="attachment" onClose={() => setIsEditorOpen(false)} />
    </section>
  )
}
