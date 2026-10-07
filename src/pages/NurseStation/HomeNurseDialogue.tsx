import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { HealthCard, HohoButton, Typography } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { useHomeFollowUpCount } from '../../features/case-continuity/useHomeFollowUpCount'
import './HomeNurseDialogue.css'

/** A direct entry into the existing nurse interview and symptom review flow. */
export function HomeNurseDialogue({ nurseVisual }: { nurseVisual: ReactNode }) {
  const navigate = useNavigate()
  const memberId = useAppStore(state => state.currentMemberId)
  const accountId = useAppStore(state => state.authUser?.id)
  const token = useAppStore(state => state.authToken)
  const ready = Boolean(memberId && accountId && token)
  const { count, status } = useHomeFollowUpCount()
  const open = () => {
    if (!ready) return
    navigate('/smart-record', { state: { homeNurseEntry: { mode: 'voice', memberId, accountId } } })
  }

  return <HealthCard className="nurse-home-dialogue" role="region" aria-label="和护士聊孩子的情况">
    <Typography className="nurse-home-dialogue__eyebrow" variant="caption">Hoooho · 值班 AI 护士</Typography>
    <div className="nurse-home-dialogue__body">
      <div className="nurse-home-dialogue__copy">
        <Typography variant="sectionTitle">孩子哪里不舒服？<br />你可以直接跟我说。</Typography>
        <Typography className="nurse-home-dialogue__description" variant="body">从你最担心的地方说起。<br />我陪你把这次情况理清楚。</Typography>
      </div>
      <div className="nurse-station-visual">{nurseVisual}</div>
    </div>
    <HohoButton disabled={!ready} fullWidth size="large" onClick={open}>和护士说</HohoButton>
    <div className="nurse-home-dialogue__footer">
      <Typography variant="caption">聊完再核对，由你确认保存</Typography>
      <HohoButton
        aria-describedby="home-follow-up-sync"
        aria-label={count == null ? '正在跟进' : `正在跟进 · ${count}`}
        className="nurse-home-dialogue__followup"
        title={status === 'error' ? '跟进数量同步失败，可进入列表重试；保留上次有效数量' : undefined}
        size="small"
        variant="text"
        onClick={() => navigate('/cases')}
      >
        正在跟进<span className="nurse-home-dialogue__count" data-stale={status === 'error'}>{count ?? '—'}{status === 'error' ? '!' : ''}</span>
      </HohoButton>
    </div>
    <span className="sr-only" id="home-follow-up-sync" role="status">{status === 'error' ? '跟进数量同步失败，可进入列表重试；保留上次有效数量' : status === 'loading' ? '正在同步跟进数量' : ''}</span>
  </HealthCard>
}
