import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, Clock3, Eye, Share2, Pencil } from '../../components/icons'
import { newShareToken, presentShareLink } from './shareLink'
import { OrganizeHeader } from '../../features/organize/OrganizeHeader'
import { MemberIdentity } from '../../features/organize/MemberIdentity'
import { ProcessingState } from '../../components/design-system/ProcessingState'
import { BottomSheetSurface, HohoButton, StatusNotice, Typography } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { apiRequest, ApiRequestError } from '../../services/apiClient'
import '../../features/case-continuity/cases.css'
import './careHandoff.css'

import { handoffDraft, handoffSchedule, type HandoffData, type HandoffDraft } from './handoffModel'
type LoadState = { status: 'loading' } | { status: 'ready'; data: HandoffData } | { status: 'error'; message: string }

// One content renderer for the parent and the person opening the shared link.
function HandoffContent({ data, draft = handoffDraft(data), avatar, onEdit }: { data: HandoffData; draft?: HandoffDraft; avatar?: string; onEdit?: (section: keyof HandoffDraft) => void }) {
  const sections = [{ id: 'routines' as const, title: '每天固定安排', rows: draft.routines, empty: '尚未设置固定安排，可补充睡眠、吃饭、用药和补剂的时间。', Icon: Clock3 }, { id: 'cautions' as const, title: '需要留意', rows: draft.cautions, empty: '暂未填写需要留意的事项。', Icon: Eye }, { id: 'parentNote' as const, title: '家长交代', rows: draft.parentNote ? [{ title: '', detail: draft.parentNote, source: '家长本次交代' }] : [], empty: '可补充安抚方式、联系方法或其他交代。', Icon: ClipboardList }]
  const m = data.member
  return <>
    <MemberIdentity member={m} avatar={avatar} asOf={data.asOf} height={m.heightCm} weight={m.weightKg} />
    {sections.map(({ Icon, ...section }) => <section key={section.id} className="hoho-health-card handoff-section" aria-labelledby={`handoff-${section.id}`}>
      <header className="handoff-module-heading"><Icon size={18} aria-hidden="true" /><Typography variant="sectionTitle" id={`handoff-${section.id}`}>{section.title}</Typography>{onEdit && <HohoButton variant="text" onClick={() => onEdit(section.id)} aria-label={`编辑${section.title}`}><Pencil size={16} />编辑</HohoButton>}</header>
      {section.id === 'routines' && section.rows.length ? <ol className="handoff-schedule" aria-label="按时间排列的固定安排">{handoffSchedule(section.rows).map(row => <li key={row.key}><span className="handoff-schedule-time">{row.time}</span><p>{row.description}</p></li>)}</ol> : section.rows.length ? section.rows.map((row, i) => <article className={`handoff-row${section.id === 'cautions' ? ' handoff-row--caution' : ''}`} key={i}>
        {row.title && <Typography variant="cardTitle">{row.title}</Typography>}{row.detail && <Typography variant="body">{row.detail}</Typography>}
      </article>) : <Typography variant="body" className="handoff-empty">{section.empty}</Typography>}
    </section>)}
  </>
}

function ParentHandoff({ memberId, token }: { memberId: string; token: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [draft, setDraft] = useState<HandoffDraft | null>(null)
  const [editing, setEditing] = useState<keyof HandoffDraft | null>(null), [editRows, setEditRows] = useState<HandoffDraft['routines']>([]), [editNote, setEditNote] = useState('')
  const [revision, setRevision] = useState(0), [sharing, setSharing] = useState(false)
  const [message, setMessage] = useState(''), [fallbackUrl, setFallbackUrl] = useState('')
  const accountId = useAppStore(s => s.authUser?.id)
  const avatar = useAppStore(s => s.members.find(member => member.id === memberId)?.avatar)
  const edited = useRef(false), pendingShare = useRef<{ key: string; token: string } | null>(null)
  const busy = useRef(false), alive = useRef(true), cachedShare = useRef<{ fingerprint: string; url: string } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    apiRequest<HandoffData>(`/api/members/${encodeURIComponent(memberId)}/care-handoff`, { token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setState({ status: 'ready', data }); setDraft(current => edited.current && current ? current : handoffDraft(data)) } })
      .catch(e => { if (!controller.signal.aborted) setState({ status: 'error', message: e.message || '暂时无法读取照顾资料' }) })
    return () => controller.abort()
  }, [memberId, token, revision])
  const stillCurrent = () => alive.current && useAppStore.getState().currentMemberId === memberId && useAppStore.getState().authUser?.id === accountId
  async function share() {
    if (busy.current || !draft || state.status !== 'ready' || !stillCurrent()) return
    busy.current = true; setSharing(true); setMessage(''); setFallbackUrl('')
    try {
      const shareKey = state.data.fingerprint + JSON.stringify(draft)
      const cached = cachedShare.current?.fingerprint === shareKey ? cachedShare.current : null
      const shareToken = cached ? '' : pendingShare.current?.key === shareKey ? pendingShare.current.token : newShareToken()
      if (!cached) pendingShare.current = { key: shareKey, token: shareToken }
      const url = cached?.url ?? new URL(`/care-handoff/shared/${shareToken}`, window.location.origin).href
      const published = cached ? Promise.resolve() : apiRequest<{ path: string }>(`/api/members/${encodeURIComponent(memberId)}/care-handoff/share`, { token, method: 'POST', body: { fingerprint: state.data.fingerprint, token: shareToken, draft } }).then(result => {
        if (new URL(result.path, window.location.origin).href !== url) throw new Error('分享链接生成失败，请重试')
        if (stillCurrent()) cachedShare.current = { fingerprint: shareKey, url }
      })
      // No await before this call: native sharing and clipboard need the click.
      const presented = presentShareLink(url, `${state.data.member.name}的照顾交接单`, published, Boolean(cached))
      await published
      const outcome = await presented
      if (!stillCurrent()) return
      if (outcome === 'shared') setMessage('已分享链接')
      else if (outcome === 'copied') setMessage('链接已复制，发给照看人即可')
      else if (outcome === 'manual') { setFallbackUrl(url); setMessage('链接已生成，请长按复制后发送') }

    } catch (e) {
      if (stillCurrent()) {
        setMessage(e instanceof Error ? e.message : '分享未完成，请重试')
        if (e instanceof ApiRequestError && e.code === 'CARE_HANDOFF_CHANGED') { pendingShare.current = null; if (edited.current) setMessage('原始资料已更新，已保留本次编辑，请核对后重新分享。'); setRevision(r => r + 1) }
      }
    } finally { busy.current = false; if (alive.current) setSharing(false) }
  }
  return <>
    <div className="continuity-scroll handoff-content">
      {state.status === 'loading' ? <ProcessingState title="正在整理照顾交接单" steps={['读取固定安排与照护事项', '整理交接内容', '准备交接单']} step={0} /> : state.status === 'error' ? <StatusNotice tone="error" title={state.message}><HohoButton variant="secondary" onClick={() => setRevision(r => r + 1)}>重试</HohoButton></StatusNotice> : <HandoffContent data={state.data} avatar={avatar} draft={draft ?? undefined} onEdit={section => { const current = draft ?? handoffDraft(state.data); setEditing(section); setEditRows(section === 'parentNote' ? [] : current[section].map(row => ({ ...row }))); setEditNote(current.parentNote) }} />}
    </div>
    <footer className="handoff-share">
      <Typography variant="caption">分享前可修改本次交接内容。</Typography>
      <HohoButton fullWidth loading={sharing} disabled={state.status !== 'ready'} onClick={() => void share()}><Share2 size={18} aria-hidden="true" />分享交接单</HohoButton>
      {message && <p role="status" className="hoho-text-caption">{message}</p>}
      {fallbackUrl && <input className="handoff-url" aria-label="分享链接" readOnly value={fallbackUrl} onFocus={e => e.currentTarget.select()} />}
    </footer>
    <BottomSheetSurface open={editing !== null} label="编辑交接内容" title={editing === 'routines' ? '每天固定安排' : editing === 'cautions' ? '需要留意' : '家长交代'} onClose={() => setEditing(null)} footer={<HohoButton fullWidth onClick={() => { if (editing && draft) { edited.current = true; setDraft({ ...draft, [editing]: editing === 'parentNote' ? editNote.trim() : editRows.filter(row => row.title.trim()).map(row => ({ ...row, title: row.title.trim(), detail: row.detail.trim() })) }); setEditing(null) } }}>保存本次交接</HohoButton>}>
      <Typography variant="caption">仅修改本次交接，不更改原始记录和固定安排。</Typography>
      {editing === 'parentNote' ? <label className="hoho-field">家长交代<textarea className="hoho-input" rows={6} maxLength={4000} value={editNote} onChange={e => setEditNote(e.target.value)} /></label> : <>
        {editRows.map((row, index) => <div className="handoff-edit-row" key={index}><label className="hoho-field">事项<input className="hoho-input" maxLength={200} value={row.title} onChange={e => setEditRows(rows => rows.map((r, i) => i === index ? { ...r, title: e.target.value, source: '家长本次交代' } : r))} /></label><label className="hoho-field">时间与说明<textarea className="hoho-input" rows={3} maxLength={2000} value={row.detail} onChange={e => setEditRows(rows => rows.map((r, i) => i === index ? { ...r, detail: e.target.value, source: '家长本次交代' } : r))} /></label><HohoButton variant="text" onClick={() => setEditRows(rows => rows.filter((_, i) => i !== index))}>删除此项</HohoButton></div>)}
        <HohoButton variant="secondary" disabled={editRows.length >= 80} onClick={() => setEditRows(rows => [...rows, { title: '', detail: '', source: '家长本次交代' }])}>添加事项</HohoButton>
      </>}
    </BottomSheetSurface>
  </>
}

export function CareHandoffPage() {
  const memberId = useAppStore(s => s.currentMemberId), token = useAppStore(s => s.authToken) ?? '', accountId = useAppStore(s => s.authUser?.id) ?? ''
  return <main className="app-shell continuity-page handoff-page"><OrganizeHeader title="照顾交接单" /><ParentHandoff key={`${memberId}:${accountId}`} memberId={memberId} token={token} /></main>
}

export function CareHandoffSharedPage() {
  const { shareToken = '' } = useParams(), [state, setState] = useState<LoadState>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController(); setState({ status: 'loading' })
    async function open() {
      // The share sheet opens immediately, while the explicit share POST is
      // publishing. A very fast recipient can arrive before that POST finishes.
      for (let attempt = 0; !controller.signal.aborted; attempt++) {
        try {
          const data = await apiRequest<HandoffData>(`/api/care-handoffs/shared/${encodeURIComponent(shareToken)}`, { signal: controller.signal })
          if (!controller.signal.aborted) setState({ status: 'ready', data })
          return
        } catch (e) {
          if (controller.signal.aborted) return
          if (e instanceof ApiRequestError && e.status === 404 && /^[A-Za-z0-9_-]{32}$/.test(shareToken) && attempt < 10) {
            await new Promise<void>(resolve => { const timeout = setTimeout(done, 1000); function done() { clearTimeout(timeout); controller.signal.removeEventListener('abort', done); resolve() } controller.signal.addEventListener('abort', done, { once: true }) })
            continue
          }
          setState({ status: 'error', message: '暂时无法打开这份照顾资料，请稍后重试或联系分享者。' })
          return
        }
      }
    }
    void open()
    return () => controller.abort()
  }, [shareToken])
  return <main className="app-shell continuity-page handoff-page"><header className="handoff-public-header"><Typography variant="pageTitle">照顾交接单</Typography><Typography variant="caption">家长分享的照顾资料</Typography></header><div className="continuity-scroll handoff-content">
    {state.status === 'loading' ? <p role="status">正在打开照顾资料…</p> : state.status === 'error' ? <StatusNotice tone="error" title={state.message} /> : <HandoffContent data={state.data} />}
  </div></main>
}
