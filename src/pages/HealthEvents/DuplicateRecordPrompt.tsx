import { useState } from 'react'
import { BottomSheetSurface, HohoButton, Typography } from '../../components/design-system'
import type { QuickRecordDuplicate } from '../../services/quickRecords'

export function DuplicateRecordPrompt({ duplicate, onCancel, onDiscard, onUpdate, onCreate }: {
  duplicate: QuickRecordDuplicate
  onCancel: () => void
  onDiscard: () => void
  onUpdate: (changeSummary: string) => Promise<void>
  onCreate: () => Promise<void>
}) {
  const [updating, setUpdating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [change, setChange] = useState(duplicate.changeSummary)
  const time = new Date(duplicate.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return <BottomSheetSurface className="duplicate-record-sheet" label="可能已记录过" layerClassName="duplicate-record-layer" onClose={()=>{if(!saving)onCancel()}} open title="可能已记录过"
    footer={updating
      ? <div className="duplicate-record-actions"><HohoButton disabled={!change.trim() || saving} fullWidth loading={saving} onClick={async () => { setSaving(true); try { await onUpdate(change.trim()) } finally { setSaving(false) } }}>保存情况更新</HohoButton><HohoButton disabled={saving} fullWidth variant="secondary" onClick={() => setUpdating(false)}>返回</HohoButton></div>
      : <div className="duplicate-record-actions"><HohoButton fullWidth disabled={saving} onClick={onCancel}>返回继续编辑</HohoButton><HohoButton disabled={saving} fullWidth variant="secondary" onClick={() => setUpdating(true)}>补充到已有记录</HohoButton><HohoButton disabled={saving} fullWidth variant="text" onClick={onDiscard}>不再记录</HohoButton><HohoButton disabled={saving} fullWidth loading={saving} variant="text" onClick={async () => { setSaving(true); try { await onCreate() } finally { setSaving(false) } }}>仍然新增一条</HohoButton></div>}>
    <div className="duplicate-record-content">
      <div className="duplicate-record-existing"><time>{time}</time><span>{duplicate.summary}</span></div>
      {!updating ? <Typography variant="body">以下记录与本次内容相似。</Typography> : <label className="duplicate-record-change"><span>这次发生了什么变化？</span>{!duplicate.hasClearChange && <small>暂时没有识别到明显变化，你可以补充哪里发生了变化。</small>}<textarea aria-label="情况变化" autoFocus maxLength={500} onChange={(event) => setChange(event.target.value)} placeholder="例如：范围扩大、体温升高或用药后缓解" rows={4} value={change} /></label>}
    </div>
  </BottomSheetSurface>
}
