import { useRef, useState } from 'react'
import { SymptomRecordFlow } from '../../pages/HealthEvents/SymptomRecordFlow'
import { useAppStore } from '../../store/useAppStore'
import { caseService } from './api'
import type { ObservationResult } from './types'

export function SymptomCaseRecord({ accountId, memberId, token, eventId, taskId, onClose, onCaptured, embedded = false, onDirtyChange }: { accountId: string; memberId: string; token: string; eventId?: string; taskId?: string; onClose: () => void; onCaptured: (id: string) => void; embedded?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const scope = `${accountId}:${memberId}:${eventId ?? 'new'}:${taskId ?? ''}`
  const requestKey = `hoooho-symptom-case-request:${scope}`
  const requestId = useRef(sessionStorage.getItem(requestKey) || crypto.randomUUID()), captured = useRef('')
  const [result, setResult] = useState<ObservationResult>()
  const today = new Date().toLocaleDateString('en-CA')
  const isCurrent = () => { const state = useAppStore.getState(); return state.currentMemberId === memberId && state.authUser?.id === accountId }
  return <SymptomRecordFlow embedded={embedded} saveLabel={embedded ? '保存到这次情况' : undefined} onDirtyChange={onDirtyChange} memberId={memberId} token={token} selectedDay={today} today={today} title={embedded ? '继续记录这次情况' : '症状记录'} draftScope={scope} onBack={onClose} onClose={() => { if (isCurrent()) captured.current ? onCaptured(captured.current) : onClose() }} onSaved={() => sessionStorage.removeItem(requestKey)} extraFields={taskId ? <section className="symptom-card"><fieldset><legend>这次观察结果</legend><div className="symptom-segmented-options">{([['improved', '改善'], ['unchanged', '无变化'], ['worse', '加重'], ['not_observed', '未观察']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={result === value} onClick={() => setResult(value)}>{label}</button>)}</div></fieldset></section> : undefined} onConfirm={async (text, occurredAt, _channel, photos, journal) => {
    if (!isCurrent()) throw new Error('当前人物已切换，请返回后重新记录')
    if (taskId && !result) throw new Error('请选择这次实际观察结果')
    sessionStorage.setItem(requestKey, requestId.current)
    const saved = await caseService.capture(memberId, token, { requestId: requestId.current, text, occurredAt, timeUnknown: journal.timePrecision === 'unknown', eventId, taskId, result, journal, photoDraftId: photos.draftId, photoIds: photos.photoIds, files: [] })
    captured.current = saved.eventId
    return '已记录'
  }} />
}
