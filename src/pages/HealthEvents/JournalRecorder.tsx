import { useEffect, useState, type CSSProperties } from 'react'
import { BottomSheetSurface, HohoButton, Typography } from '../../components/design-system'
import { QuickVoiceRecordFlow, type QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { journalCategoryGroups, type JournalCategory } from './timeViewModel'

export function JournalRecorder({ mode, memberId, token, onClose, onConfirm }: {
  mode: 'manual' | 'voice'; memberId: string; token: string; onClose: () => void
  onConfirm: (text: string, occurredAt: string, channel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, categories: JournalCategory[]) => Promise<string>
}) {
  const [editing, setEditing] = useState(mode === 'voice')
  const [selected, setSelected] = useState<JournalCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [viewport, setViewport] = useState({ height: window.visualViewport?.height ?? window.innerHeight, inset: 0 })
  useEffect(() => {
    const vv = window.visualViewport
    const update = () => setViewport({ height: vv?.height ?? window.innerHeight, inset: Math.max(0, window.innerHeight - (vv?.height ?? window.innerHeight) - (vv?.offsetTop ?? 0)) })
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => { vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update) }
  }, [])
  return <div style={{ '--journal-viewport-height': `${viewport.height}px`, '--journal-keyboard-inset': `${viewport.inset}px` } as CSSProperties}><BottomSheetSurface className="journal-recorder-sheet" open label={editing ? '记录内容' : '分类提醒板'} title={editing ? '记录到今天' : '今天想记些什么？'} onClose={() => { if (!saving) onClose() }}
    footer={!editing && <HohoButton fullWidth onClick={() => setEditing(true)}>开始记录</HohoButton>}>
    {!editing ? <><Typography variant="caption">可以选一个或多个方向，也可以直接开始记录。</Typography>{journalCategoryGroups.map((group) => <section className="journal-category-group" key={group.label} aria-label={group.label}><h3 className="hoho-text-label">{group.label}</h3><div>{group.items.map(([category, label]) => <HohoButton variant="secondary" key={category} aria-pressed={selected.includes(category)} onClick={() => setSelected((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category])}><JournalCategoryIcon category={category} />{label}</HohoButton>)}</div></section>)}</> :
      <QuickVoiceRecordFlow open presentation="nurse-inline" initialInputChannel={mode === 'voice' ? 'voice' : 'text'} photoMemberId={memberId} photoToken={token}
        onActivityChange={(activity) => setSaving(activity === 'saving')}
        onClose={onClose}
        onConfirm={(text, occurredAt, _candidates, channel, photos) => onConfirm(text, occurredAt, channel, photos, selected)} />}
  </BottomSheetSurface></div>
}
