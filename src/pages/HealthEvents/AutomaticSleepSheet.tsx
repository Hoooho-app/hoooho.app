import { useMemo, useRef, useState } from 'react'
import { BottomSheetSurface } from '../../components/design-system'
import { routineTrackService, type RoutineTrack } from '../../services/routineTracks'
import { SleepEditor, type SleepDraft } from './SleepRecordFlow'
import { automaticSleepDraft } from './automaticSleepDraft'

export function AutomaticSleepSheet({ track, memberId, token, onClose, onSaved }: { track: RoutineTrack; memberId: string; token: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const key = useRef(crypto.randomUUID().replaceAll('-', ''))
  const initial = useMemo(() => automaticSleepDraft(track), [track])
  const act = async (action: 'confirm' | 'skipped', draft = initial) => {
    if (saving) return
    setSaving(true); setError('')
    try {
      await routineTrackService.act(memberId, track.itemKey, { action, day: track.day, idempotencyKey: key.current, sleepAt: draft.sleepAt, wakeAt: draft.wakeAt, sleepStatus: draft.status, timeZone: draft.timeZone, quality: draft.quality, observations: draft.observations, otherNote: draft.otherNote }, token)
      onSaved(action === 'skipped' ? '已标记本次未发生' : '已保存睡眠记录'); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  return <BottomSheetSurface className="sleep-editor-sheet" label="记录睡眠" onClose={() => { if (!saving) onClose() }} open title="记录睡眠"><SleepEditor automatic error={error} initial={initial} onSave={draft => void act('confirm', draft)} onSkip={() => void act('skipped')} saving={saving} /></BottomSheetSurface>
}
