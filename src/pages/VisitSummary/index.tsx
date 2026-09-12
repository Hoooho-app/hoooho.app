import { ArrowLeft, ChevronDown, ChevronRight, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { createHealthProfilePromptSections, type HealthEventPromptContext } from '../../features/ask-ai'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { copyPromptText } from '../../features/ask-ai'
import { healthEventService } from '../../services/healthEvents'
import { useAppStore } from '../../store/useAppStore'
import type { MedicalPreparationApiDto } from '../../types'
import { buildMedicalPreparation, getMedicalPreparationFingerprint } from '../HealthEvents/consultationSummary'
import { createVisitSummaryPresentation, type VisitEvidence, type VisitSectionId } from './visitSummaryPresentation'
import './visitSummary.css'

export function VisitSummaryPage() {
  const { eventId = '' } = useParams(); const navigate = useNavigate(); const token = useAppStore((state) => state.authToken); const currentMemberId = useAppStore((state) => state.currentMemberId)
  const { state } = useHealthEventDetail(eventId || undefined)
  const [existing, setExisting] = useState<MedicalPreparationApiDto | null | undefined>(undefined)
  useEffect(() => { if (!token || !currentMemberId) return; const controller = new AbortController(); healthEventService.list(token, controller.signal).then((events) => setExisting(events.filter((event) => event.memberId === currentMemberId).map((event) => event.medicalPreparation).filter((value) => value != null).sort((left, right) => right.version - left.version)[0] ?? null)).catch(() => setExisting(null)); return () => controller.abort() }, [currentMemberId, token])
  if (state.status === 'loading' || existing === undefined) return <VisitShell onBack={() => navigate(-1)}><Organizing /></VisitShell>
  if (state.status !== 'success' || state.data.member.id !== currentMemberId) return <VisitShell onBack={() => navigate(-1)}><div className="visit-summary-status"><StatusNotice title="就诊情况单暂时无法打开" tone="error">请返回后重试。</StatusNotice></div></VisitShell>
  const event = state.data.viewModel.event
  const profile = createHealthProfilePromptSections(getStoredHealthProfileSectionSnapshots(state.data.member.id))
  const context: HealthEventPromptContext = { attachments: state.data.attachments, currentMemberId, event: { ...event, summary: state.data.eventDto.eventSummary?.displayedResult.summary ?? event.summary }, healthProfile: profile, member: state.data.member, organizations: state.data.organizations, records: state.data.records, relatedEvents: state.data.relatedEvents }
  return <VisitSummaryLoaded context={context} eventId={eventId} initial={state.data.eventDto.medicalPreparation ?? existing} onBack={() => navigate(-1)} token={token ?? ''} />
}

function VisitSummaryLoaded({ context, eventId, initial, onBack, token }: { context: HealthEventPromptContext; eventId: string; initial: MedicalPreparationApiDto | null; onBack: () => void; token: string }) {
  const fingerprint = useMemo(() => getMedicalPreparationFingerprint(context), [context]); const [preparation, setPreparation] = useState(initial); const [status, setStatus] = useState<'reading' | 'working' | 'error'>(initial ? 'reading' : 'working'); const [error, setError] = useState(''); const started = useRef(false)
  const save = async () => { setStatus('working'); setError(''); try { const result = await healthEventService.saveMedicalPreparation(eventId, { sourceFingerprint: fingerprint, summary: buildMedicalPreparation(context) }, token); setPreparation(result.medicalPreparation); setStatus('reading') } catch (reason) { setError(reason instanceof Error ? reason.message : '生成失败，请稍后重试'); setStatus('error') } }
  useEffect(() => { if (!initial && !started.current) { started.current = true; void save() } }, [])
  if (status === 'working') return <VisitShell onBack={onBack}><Organizing /></VisitShell>
  if (status === 'error') return <VisitShell onBack={onBack}><div className="visit-summary-status"><StatusNotice title={preparation ? '更新未完成' : '暂时没有生成成功'} tone="error">{error}<br />健康记录和上一版本不受影响。</StatusNotice><HohoButton fullWidth onClick={() => void save()}>重试</HohoButton>{preparation && <HohoButton fullWidth onClick={() => setStatus('reading')} variant="secondary">继续查看原情况单</HohoButton>}</div></VisitShell>
  if (!preparation) return null
  return <VisitShell onBack={onBack} onShare={() => void copyPromptText(`${window.location.origin}/medical-preparation/${preparation.shareToken}`)}><VisitSummaryContent preparation={preparation} stale={preparation.sourceFingerprint !== fingerprint} onUpdate={() => void save()} /></VisitShell>
}

function VisitShell({ children, onBack, onShare }: { children: ReactNode; onBack: () => void; onShare?: () => void }) { return <main className="app-shell visit-summary-page"><header className="visit-summary-header"><button aria-label="返回" onClick={onBack} type="button"><ArrowLeft /></button><strong>就诊情况单</strong>{onShare ? <button aria-label="分享只读情况单" onClick={onShare} type="button"><Share2 /></button> : <span />}</header>{children}</main> }
function Organizing() { return <section className="visit-summary-organizing"><div className="visit-summary-organizing__mark">▤</div><h1>正在整理已有记录</h1><p>按当前情况、经过与依据生成</p><ol><li>读取当前成员的健康记录</li><li>归并相互关联的情况</li><li>生成可核对的情况单</li></ol></section> }

export function VisitSummaryContent({ preparation, readOnly = false, stale = false, onUpdate }: { preparation: MedicalPreparationApiDto; readOnly?: boolean; stale?: boolean; onUpdate?: () => void }) {
  const view = useMemo(() => createVisitSummaryPresentation(preparation), [preparation]); const [active, setActive] = useState<VisitSectionId>('overview'); const [expanded, setExpanded] = useState(''); const [evidence, setEvidence] = useState<VisitEvidence | null>(null); const scroller = useRef<HTMLDivElement>(null)
  const basic = preparation.summary.sections.find((section) => section.id === 'basic')?.lines ?? []; const meta = basic.filter((line) => /^(性别|年龄)：/.test(line)).map((line) => line.split('：')[1]).join(' · ')
  const jump = (id: VisitSectionId) => { setActive(id); scroller.current?.querySelector<HTMLElement>(`#visit-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const syncActiveSection = () => { const root = scroller.current; if (!root) return; const current = [...root.querySelectorAll<HTMLElement>('.visit-summary-section')].reverse().find((section) => section.offsetTop <= root.scrollTop + 110); if (current) setActive(current.id.replace('visit-', '') as VisitSectionId) }
  return <><nav aria-label="情况单章节" className="visit-summary-rail">{view.sections.map((section) => <button aria-current={active === section.id ? 'location' : undefined} key={section.id} onClick={() => jump(section.id)} type="button">{section.label}</button>)}</nav><div className="visit-summary-scroll" onScroll={syncActiveSection} ref={scroller}><article className="visit-summary-document"><section className="visit-summary-identity"><span>{preparation.summary.memberName.slice(0, 1)}</span><div><h1>{preparation.summary.memberName}</h1><p>{meta}</p></div></section><p className="visit-summary-version">{readOnly ? '固定快照' : '资料更新至'} {formatVisitTime(preparation.updatedAt)} · v{preparation.version}</p>{stale && <aside className="visit-summary-update"><div><strong>有新内容待同步</strong><small>当前先显示上一次成功生成的版本</small></div><HohoButton onClick={onUpdate} size="small">更新情况单</HohoButton></aside>}
    {view.sections.map((section) => <section className="visit-summary-section" id={`visit-${section.id}`} key={section.id}><h2>{section.label === 'overview' ? '情况概览' : section.label === 'course' ? '问题与经过' : section.label}</h2>{section.id === 'overview' ? <><div className="visit-summary-hero"><small>当前重点情况</small><p>{view.overview.join('；')}</p></div>{view.problems.length > 0 && <div className="visit-summary-problems">{view.problems.map((problem) => <article key={problem.id}><button aria-expanded={expanded === problem.id} onClick={() => setExpanded((value) => value === problem.id ? '' : problem.id)} type="button"><span><strong>{problem.title}</strong><small>{problem.meta}</small></span>{expanded === problem.id ? <ChevronDown /> : <ChevronRight />}</button><p>{problem.summary}</p>{expanded === problem.id && <div className="visit-summary-problem-detail">{problem.evidence.lines.map((line) => <p key={line}>{line}</p>)}<button onClick={() => setEvidence(problem.evidence)} type="button">查看依据 ›</button></div>}</article>)}</div>}</> : <div className="visit-summary-card"><ul>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul><button onClick={() => setEvidence({ id: section.id, label: `${section.label}的原始依据`, lines: section.lines })} type="button">查看依据 ›</button></div>}</section>)}<footer>{readOnly ? '此页面不包含编辑、更新或家庭账户入口' : '内容由已保存的健康记录整理，不替代诊断或治疗建议'}</footer></article></div>{evidence && <EvidenceSheet evidence={evidence} onClose={() => setEvidence(null)} />}</>
}
function EvidenceSheet({ evidence, onClose }: { evidence: VisitEvidence; onClose: () => void }) { return <div className="visit-evidence-backdrop" onClick={onClose}><section aria-label={evidence.label} aria-modal="true" className="visit-evidence-sheet" onClick={(event) => event.stopPropagation()} role="dialog"><header><h2>{evidence.label}</h2><button aria-label="关闭依据" onClick={onClose} type="button"><X /></button></header>{evidence.lines.map((line) => <article key={line}><p>{line}</p><small>来源：健康随记或健康档案</small></article>)}</section></div> }
export function formatVisitTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) }
