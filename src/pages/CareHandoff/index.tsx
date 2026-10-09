import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MainAppHeader } from '../../components/navigation'
import { HealthCard, HohoButton, HohoSection, StatusNotice, Typography } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { apiRequest, ApiRequestError } from '../../services/apiClient'
import '../../features/case-continuity/cases.css'
import './careHandoff.css'

interface HandoffData {
  fingerprint: string
  asOf: string
  member: { name: string; birthday?: string; gender?: string; heightCm?: number | null; weightKg?: number | null; bloodType?: string | null }
  sections: { id: string; title: string; empty: string; rows: { title: string; detail: string; source: string }[] }[]
}
type LoadState = { status: 'loading' } | { status: 'ready'; data: HandoffData } | { status: 'error'; message: string }

function age(birthday: string | undefined, day: string) {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday) || birthday > day) return ''
  const months = (Number(day.slice(0, 4)) - Number(birthday.slice(0, 4))) * 12 + Number(day.slice(5, 7)) - Number(birthday.slice(5, 7)) - (day.slice(8) < birthday.slice(8) ? 1 : 0)
  return months < 12 ? `${Math.max(0, months)}个月` : `${Math.floor(months / 12)}岁${months % 12 ? `${months % 12}个月` : ''}`
}

// One content renderer for the parent and the person opening the shared link.
function HandoffContent({ data }: { data: HandoffData }) {
  const m = data.member
  const info = [age(m.birthday, data.asOf), (m.gender === 'male' ? '男' : m.gender === 'female' ? '女' : ''), m.birthday ? `${m.birthday}出生` : '', m.heightCm ? `身高 ${m.heightCm} cm` : '', m.weightKg ? `体重 ${m.weightKg} kg` : '', m.bloodType ? `${m.bloodType}型` : ''].filter(Boolean)
  return <>
    <HealthCard className="handoff-basic"><Typography variant="caption">基本资料</Typography><Typography variant="sectionTitle">{m.name}</Typography><Typography variant="body">{info.length ? info.join(' · ') : '尚未录入基本资料。'}</Typography><Typography variant="caption">资料版本：{data.asOf}</Typography></HealthCard>
    {data.sections.map(section => <HohoSection key={section.id} title={section.title} className="handoff-section">
      {section.rows.length ? section.rows.map((row, i) => <article className="handoff-row" key={`${section.id}-${i}`}>
        <Typography variant="cardTitle">{row.title}</Typography>
        {row.detail && <Typography variant="body">{row.detail}</Typography>}
        {row.source && <Typography variant="caption">{row.source}</Typography>}
      </article>) : <Typography variant="body" className="handoff-empty">{section.empty}</Typography>}
    </HohoSection>)}
  </>
}

function ParentHandoff({ memberId, token }: { memberId: string; token: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [revision, setRevision] = useState(0), [sharing, setSharing] = useState(false)
  const [message, setMessage] = useState(''), [fallbackUrl, setFallbackUrl] = useState('')
  const busy = useRef(false), alive = useRef(true), cachedShare = useRef<{ fingerprint: string; url: string } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' }); cachedShare.current = null
    apiRequest<HandoffData>(`/api/members/${encodeURIComponent(memberId)}/care-handoff`, { token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ status: 'ready', data }) })
      .catch(e => { if (!controller.signal.aborted) setState({ status: 'error', message: e.message || '暂时无法读取照看资料' }) })
    return () => controller.abort()
  }, [memberId, token, revision])
  const stillCurrent = () => alive.current && useAppStore.getState().currentMemberId === memberId && useAppStore.getState().authToken === token
  async function share() {
    if (busy.current || state.status !== 'ready' || !stillCurrent()) return
    busy.current = true; setSharing(true); setMessage(''); setFallbackUrl('')
    try {
      let url = cachedShare.current?.fingerprint === state.data.fingerprint ? cachedShare.current.url : ''
      if (!url) {
        const result = await apiRequest<{ path: string }>(`/api/members/${encodeURIComponent(memberId)}/care-handoff/share`, { token, method: 'POST', body: { fingerprint: state.data.fingerprint } })
        if (!stillCurrent()) return
        url = new URL(result.path, window.location.origin).href
        cachedShare.current = { fingerprint: state.data.fingerprint, url }
      }
      if (navigator.share) {
        try { await navigator.share({ title: `${state.data.member.name}的照看交接`, url }); if (stillCurrent()) setMessage('已分享链接'); return }
        catch (e) { if (e instanceof Error && e.name === 'AbortError') return }
      }
      try { await navigator.clipboard.writeText(url); if (stillCurrent()) setMessage('链接已复制，发给照看人即可') }
      catch { if (stillCurrent()) { setFallbackUrl(url); setMessage('请长按复制链接，发给照看人') } }
    } catch (e) {
      if (stillCurrent()) {
        setMessage(e instanceof Error ? e.message : '分享未完成，请重试')
        if (e instanceof ApiRequestError && e.code === 'CARE_HANDOFF_CHANGED') setRevision(r => r + 1)
      }
    } finally { busy.current = false; if (alive.current) setSharing(false) }
  }
  return <>
    <div className="continuity-scroll handoff-content">
      {state.status === 'loading' ? <p role="status">正在读取照看资料…</p> : state.status === 'error' ? <StatusNotice tone="error" title={state.message}><HohoButton variant="secondary" onClick={() => setRevision(r => r + 1)}>重试</HohoButton></StatusNotice> : <HandoffContent data={state.data} />}
    </div>
    <footer className="handoff-share">
      <Typography variant="caption">分享以上全部内容，对方打开链接即可查看。</Typography>
      <HohoButton fullWidth loading={sharing} disabled={state.status !== 'ready'} onClick={() => void share()}>分享链接</HohoButton>
      {message && <p role="status" className="hoho-text-caption">{message}</p>}
      {fallbackUrl && <input className="handoff-url" aria-label="分享链接" readOnly value={fallbackUrl} onFocus={e => e.currentTarget.select()} />}
    </footer>
  </>
}

export function CareHandoffPage() {
  const memberId = useAppStore(s => s.currentMemberId), token = useAppStore(s => s.authToken) ?? ''
  return <main className="app-shell continuity-page handoff-page"><MainAppHeader title="照看交接" /><ParentHandoff key={`${memberId}:${token}`} memberId={memberId} token={token} /></main>
}

export function CareHandoffSharedPage() {
  const { shareToken = '' } = useParams(), [state, setState] = useState<LoadState>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController(); setState({ status: 'loading' })
    apiRequest<HandoffData>(`/api/care-handoffs/shared/${encodeURIComponent(shareToken)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ status: 'ready', data }) })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error', message: '暂时无法打开这份照看资料，请稍后重试或联系分享者。' }) })
    return () => controller.abort()
  }, [shareToken])
  return <main className="app-shell continuity-page handoff-page"><header className="handoff-public-header"><Typography variant="pageTitle">照看交接</Typography><Typography variant="caption">家长分享的照看资料</Typography></header><div className="continuity-scroll handoff-content">
    {state.status === 'loading' ? <p role="status">正在打开照看资料…</p> : state.status === 'error' ? <StatusNotice tone="error" title={state.message} /> : <HandoffContent data={state.data} />}
  </div></main>
}
