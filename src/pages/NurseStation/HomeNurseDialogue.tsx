import { useNavigate } from 'react-router-dom'
import { HealthCard, HohoButton, Typography } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import './HomeNurseDialogue.css'

/** A direct entry into the existing nurse interview and symptom review flow. */
export function HomeNurseDialogue() {
  const navigate = useNavigate()
  const memberId = useAppStore(state => state.currentMemberId)
  const accountId = useAppStore(state => state.authUser?.id)
  const token = useAppStore(state => state.authToken)
  const ready = Boolean(memberId && accountId && token)
  const open = (mode: 'voice' | 'text') => {
    if (!ready) return
    navigate('/smart-record', { state: { homeNurseEntry: { mode, memberId, accountId } } })
  }

  return <HealthCard className="nurse-home-dialogue" role="region" aria-label="和护士聊孩子的情况">
    <Typography className="nurse-home-dialogue__eyebrow" variant="caption">Hoooho · 值班 AI 护士</Typography>
    <Typography variant="sectionTitle">孩子哪里不舒服？<br />你可以直接跟我说。</Typography>
    <Typography className="nurse-home-dialogue__description" variant="body">从你最担心的地方说起。<br />我陪你把这次情况理清楚。</Typography>
    <HohoButton disabled={!ready} fullWidth size="large" onClick={() => open('voice')}>和护士说</HohoButton>
    <div className="nurse-home-dialogue__footer">
      <Typography variant="caption">聊完再核对，由你确认保存</Typography>
      <HohoButton disabled={!ready} size="small" variant="text" onClick={() => open('text')}>打字聊</HohoButton>
    </div>
  </HealthCard>
}
