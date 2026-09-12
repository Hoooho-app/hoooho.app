import { Download, Eye, FileHeart, List, MoreHorizontal, RefreshCw, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { createHealthProfilePromptSections, type HealthEventPromptContext } from '../../features/ask-ai'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { healthEventService } from '../../services/healthEvents'
import { useAppStore } from '../../store/useAppStore'
import type { MedicalPreparationApiDto } from '../../types'
import { buildMedicalPreparation, getMedicalPreparationFingerprint, type ConsultationSummary } from './consultationSummary'
import './NurseNextAction.css'

interface Props { currentMemberId: string; eventId: string | null; existingPreparation?: MedicalPreparationApiDto | null; onChanged?: () => void; onClose: () => void; open: boolean }
type View = 'working' | 'result' | 'error'

export function NurseNextAction({ currentMemberId, eventId, existingPreparation, onChanged, onClose, open }: Props) {
  const { state, retry } = useHealthEventDetail(open ? eventId ?? undefined : undefined)
  const profile = useMemo(() => state.status === 'success' ? createHealthProfilePromptSections(getStoredHealthProfileSectionSnapshots(state.data.member.id)) : [], [state])
  if (!open) return null
  if (!eventId || state.status === 'loading') return <StatusSheet onClose={onClose}><StatusNotice title="正在打开就诊情况单">正在读取已有记录…</StatusNotice></StatusSheet>
  if (state.status === 'error') return <StatusSheet onClose={onClose}><StatusNotice action={<HohoButton onClick={retry} size="small" variant="secondary">重试</HohoButton>} title="就诊情况单加载失败" tone="error">{state.message}</StatusNotice></StatusSheet>
  if (state.status === 'not-found' || state.data.eventDto.memberId !== currentMemberId) return <StatusSheet onClose={onClose}><StatusNotice title="当前就诊情况单不可用" tone="error">请关闭后重试。</StatusNotice></StatusSheet>
  const event = state.data.viewModel.event
  const context: HealthEventPromptContext = { attachments: state.data.attachments, currentMemberId, event: { ...event, summary: state.data.eventDto.eventSummary?.displayedResult.summary ?? event.summary }, healthProfile: profile, member: state.data.member, organizations: state.data.organizations, records: state.data.records, relatedEvents: state.data.relatedEvents }
  return <Loaded context={context} eventId={eventId} initial={state.data.eventDto.medicalPreparation ?? existingPreparation ?? null} onChanged={onChanged} onClose={onClose} />
}

function Loaded({ context, eventId, initial, onChanged, onClose }: { context: HealthEventPromptContext; eventId: string; initial: MedicalPreparationApiDto | null; onChanged?: () => void; onClose: () => void }) {
  const token = useAppStore((value) => value.authToken)
  const fingerprint = useMemo(() => getMedicalPreparationFingerprint(context), [context])
  const [preparation, setPreparation] = useState(initial)
  const [view, setView] = useState<View>(initial ? 'result' : 'working')
  const [message, setMessage] = useState('')
  const started = useRef(false)
  const hasChanges = Boolean(preparation && preparation.sourceFingerprint !== fingerprint)
  const save = async () => {
    if (!token) { setMessage('登录状态已失效，请重新登录后再试'); setView('error'); return }
    setView('working'); setMessage('')
    try {
      const result = await healthEventService.saveMedicalPreparation(eventId, { sourceFingerprint: fingerprint, summary: buildMedicalPreparation(context) }, token)
      setPreparation(result.medicalPreparation); onChanged?.(); setView('result')
    } catch (error) { setMessage(error instanceof Error ? error.message : '生成失败，请稍后重试'); setView('error') }
  }
  useEffect(() => { if (!initial && !started.current) { started.current = true; void save() } }, [])
  return <BottomSheetSurface className="nurse-next-action-sheet" label="就诊情况单" onClose={onClose} open title="就诊情况单">
    {view === 'working' ? <div className="medical-preparation-working"><span><FileHeart /></span><h3>正在整理已有记录</h3><p>按情况、经过与依据生成</p></div>
      : view === 'error' ? <div className="medical-preparation-error"><StatusNotice title={preparation ? '更新未完成' : '暂时没有生成成功'} tone="error">{message}<br />健康记录不受影响。</StatusNotice><HohoButton fullWidth onClick={() => void save()}><RefreshCw />重试</HohoButton>{preparation && <HohoButton fullWidth onClick={() => setView('result')} variant="secondary">继续查看原情况单</HohoButton>}</div>
        : preparation ? <SummaryResult hasChanges={hasChanges} onClose={onClose} onUpdate={() => void save()} preparation={preparation} /> : null}
  </BottomSheetSurface>
}

export function SummaryDocument({ summary, onEvidence }: { summary: ConsultationSummary | MedicalPreparationApiDto['summary']; onEvidence?: () => void }) {
  return <article className="nurse-summary-document"><header><strong>Hoooho</strong><span>{summary.memberName}的就诊情况单</span></header>{summary.sections.map((section) => <section id={`summary-${section.id}`} key={section.id}><h3>{section.title}</h3><ul>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul>{onEvidence && <button className="summary-source-link" onClick={onEvidence} type="button">查看原始依据</button>}</section>)}</article>
}

function SummaryResult({ hasChanges, onClose, onUpdate, preparation }: { hasChanges: boolean; onClose: () => void; onUpdate: () => void; preparation: MedicalPreparationApiDto }) {
  const [menu, setMenu] = useState<'more' | 'directory' | 'evidence' | null>(null)
  const [presenting, setPresenting] = useState(false)
  const shareUrl = `${window.location.origin}/medical-preparation/${preparation.shareToken}`
  const openSection = (id: string) => { setMenu(null); document.querySelector(`#summary-${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const sheet = menu && <ActionSheet onClose={() => setMenu(null)} title={menu === 'directory' ? '情况单目录' : menu === 'evidence' ? '原始依据' : '情况单'}>{menu === 'directory' ? preparation.summary.sections.map((section) => <button key={section.id} onClick={() => openSection(section.id)} type="button">{section.title}</button>) : menu === 'evidence' ? <p>本节来自生成时纳入的健康随记和健康档案。请返回对应记录查看原文与附件。</p> : <><button onClick={() => { setMenu(null); setPresenting(true) }} type="button"><Eye />当面出示</button><button onClick={() => downloadReport(preparation)} type="button"><Download />下载交互式文件</button><button onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')} type="button"><Share2 />分享只读情况单</button><button onClick={onClose} type="button"><X />关闭情况单</button></>}</ActionSheet>
  if (presenting) return <div className="medical-preparation-present"><header><span>只读 · v{preparation.version}</span><button onClick={() => setPresenting(false)} type="button">退出出示</button></header><SummaryDocument summary={preparation.summary} onEvidence={() => setMenu('evidence')} /><DirectoryButton onClick={() => setMenu('directory')} />{sheet}</div>
  return <div className="nurse-summary-result">{hasChanges && <div className="medical-preparation-update"><span><strong>有新内容待同步</strong><small>当前查看的是截至 {formatUpdatedAt(preparation.updatedAt)} 的版本</small></span><HohoButton onClick={onUpdate} size="small">更新情况单</HohoButton></div>}<div className="summary-toolbar"><span>v{preparation.version} · 资料截至 {formatUpdatedAt(preparation.updatedAt)}</span><button aria-label="更多操作" onClick={() => setMenu('more')} type="button"><MoreHorizontal /></button></div><SummaryDocument summary={preparation.summary} onEvidence={() => setMenu('evidence')} /><DirectoryButton onClick={() => setMenu('directory')} />{sheet}</div>
}

function DirectoryButton({ onClick }: { onClick: () => void }) { return <button className="summary-directory-button" onClick={onClick} type="button"><List />目录</button> }
function ActionSheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) { return <div className="summary-action-backdrop" onClick={onClose}><section aria-label={title} aria-modal="true" className="summary-action-sheet" onClick={(event) => event.stopPropagation()} role="dialog"><header><h3>{title}</h3><button aria-label="关闭" onClick={onClose} type="button"><X /></button></header>{children}</section></div> }
function downloadReport(preparation: MedicalPreparationApiDto) {
  const sections = preparation.summary.sections.map((section) => `<section id="${escapeHtml(section.id)}"><h2>${escapeHtml(section.title)}</h2><ul>${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></section>`).join('')
  const directory = preparation.summary.sections.map((section) => `<button onclick="document.getElementById('${escapeHtml(section.id)}').scrollIntoView()">${escapeHtml(section.title)}</button>`).join('')
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><title>${escapeHtml(preparation.summary.memberName)}的就诊情况单</title><style>body{margin:0;background:#f7faf9;color:#17312d;font:15px/1.65 system-ui,sans-serif}.shell{max-width:680px;margin:auto;padding:20px}.brand{color:#168777;font-weight:800}.meta{color:#71847f;font-size:12px}section{margin:14px 0;padding:16px;background:#fff;border:1px solid #d7e8e4;border-radius:14px}h1{font-size:24px}h2{font-size:17px}button{margin:4px;padding:9px 12px;border:1px solid #c8dfda;border-radius:10px;background:#fff;color:#168777}</style></head><body><main class="shell"><b class="brand">Hoooho</b><h1>${escapeHtml(preparation.summary.memberName)}的就诊情况单</h1><p class="meta">固定版本 v${preparation.version} · 资料截至 ${escapeHtml(formatUpdatedAt(preparation.updatedAt))}</p><nav>${directory}</nav>${sections}<p class="meta">此文件为生成时的固定快照，可离线阅读。</p></main></body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Hoooho-${preparation.summary.memberName}-v${preparation.version}.html`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!) }
export function formatUpdatedAt(value: string) { const date = new Date(value); return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date) }
function StatusSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) { return <BottomSheetSurface label="就诊情况单" onClose={onClose} open title="就诊情况单">{children}</BottomSheetSurface> }
