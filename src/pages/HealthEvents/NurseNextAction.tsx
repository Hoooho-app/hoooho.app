import { Check, ChevronRight, ClipboardCopy, FileHeart, Share2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { copyPromptText, createHealthProfilePromptSections, type HealthEventPromptContext } from '../../features/ask-ai'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { healthEventService } from '../../services/healthEvents'
import { useAppStore } from '../../store/useAppStore'
import type { MedicalPreparationApiDto } from '../../types'
import { buildMedicalPreparation, getMedicalPreparationFingerprint, type ConsultationSummary } from './consultationSummary'
import './NurseNextAction.css'

interface Props { currentMemberId: string; eventId: string | null; onChanged?: () => void; onClose: () => void; open: boolean }
type View = 'actions' | 'working' | 'result' | 'current'

export function NurseNextAction({ currentMemberId, eventId, onChanged, onClose, open }: Props) {
  const { state, retry } = useHealthEventDetail(open ? eventId ?? undefined : undefined)
  const profile = useMemo(() => state.status === 'success' ? createHealthProfilePromptSections(getStoredHealthProfileSectionSnapshots(state.data.member.id)) : [], [state])
  if (!open) return null
  if (!eventId || state.status === 'loading') return <StatusSheet onClose={onClose}><StatusNotice title="正在准备就医资料">正在读取当前健康随记…</StatusNotice></StatusSheet>
  if (state.status === 'error') return <StatusSheet onClose={onClose}><StatusNotice action={<HohoButton onClick={retry} size="small" variant="secondary">重新加载</HohoButton>} title="就医准备加载失败" tone="error">{state.message}</StatusNotice></StatusSheet>
  if (state.status === 'not-found' || state.data.eventDto.memberId !== currentMemberId) return <StatusSheet onClose={onClose}><StatusNotice title="当前健康随记不可用" tone="error">请关闭后重试。</StatusNotice></StatusSheet>
  const event = state.data.viewModel.event
  const context: HealthEventPromptContext = { attachments: state.data.attachments, currentMemberId, event: { ...event, summary: state.data.eventDto.eventSummary?.displayedResult.summary ?? event.summary }, healthProfile: profile, member: state.data.member, organizations: state.data.organizations, records: state.data.records, relatedEvents: state.data.relatedEvents }
  return <Loaded context={context} eventId={eventId} initial={state.data.eventDto.medicalPreparation ?? null} onChanged={onChanged} onClose={onClose} />
}

function Loaded({ context, eventId, initial, onChanged, onClose }: { context: HealthEventPromptContext; eventId: string; initial: MedicalPreparationApiDto | null; onChanged?: () => void; onClose: () => void }) {
  const token = useAppStore((value) => value.authToken)
  const fingerprint = useMemo(() => getMedicalPreparationFingerprint(context), [context])
  const [preparation, setPreparation] = useState(initial)
  const [view, setView] = useState<View>('actions')
  const [feedback, setFeedback] = useState('')
  const hasChanges = Boolean(preparation && preparation.sourceFingerprint !== fingerprint)

  const save = async (openAfter = true) => {
    if (!token) return null
    if (preparation && !hasChanges) { setView('current'); return preparation }
    setView('working'); setFeedback('')
    try {
      const result = await healthEventService.saveMedicalPreparation(eventId, { sourceFingerprint: fingerprint, summary: buildMedicalPreparation(context) }, token)
      setPreparation(result.medicalPreparation); onChanged?.(); setFeedback(result.status === 'updated' ? '病情摘要已更新' : ''); setView(openAfter ? 'result' : 'actions')
      return result.medicalPreparation
    } catch (error) { setFeedback(error instanceof Error ? error.message : '病情摘要生成失败，请稍后重试'); setView('actions'); return null }
  }
  const copyPrompt = async () => {
    const latest = preparation ?? await save(false)
    if (!latest) return
    const result = await copyPromptText(latest.summary.prompt)
    setFeedback(result.ok ? 'AI 问诊提示词已复制' : result.message)
    window.setTimeout(() => setFeedback(''), 1500)
  }
  const title = view === 'result' || view === 'current' ? '病情摘要' : '就医准备'
  return <BottomSheetSurface className="nurse-next-action-sheet" label={title} onClose={onClose} open title={title}>
    {view === 'working' ? <div className="medical-preparation-working"><span><FileHeart /></span><h3>{preparation ? '正在更新病情摘要……' : '正在生成病情摘要……'}</h3><p>{preparation ? '正在同步新增记录并重新整理' : '正在整理相关健康记录'}</p></div>
      : view === 'current' && preparation ? <div className="medical-preparation-current"><StatusNotice title="病情摘要已经是最新的">暂无需要同步的新记录</StatusNotice><HohoButton fullWidth onClick={() => setView('result')}>打开病情摘要</HohoButton></div>
        : view === 'result' && preparation ? <SummaryResult feedback={feedback} preparation={preparation} />
          : <div className="medical-preparation-actions">
            <button onClick={() => void save()} type="button"><span><FileHeart /></span><span><strong>{preparation ? '更新病情摘要' : '生成病情摘要'}{hasChanges && <i aria-label="有新变化待同步" />}</strong><small>{!preparation ? '生成可交互查看的病情摘要' : hasChanges ? '有新的健康记录待同步' : `上次更新：${formatUpdatedAt(preparation.updatedAt)}`}</small></span><ChevronRight /></button>
            <button onClick={() => void copyPrompt()} type="button"><span><ClipboardCopy /></span><span><strong>复制 AI 问诊提示词</strong><small>适用于 AI 问诊场景</small></span><ChevronRight /></button>
            {feedback && <p aria-live="polite" className="nurse-summary-feedback" role="status">{feedback}</p>}
          </div>}
  </BottomSheetSurface>
}

export function SummaryDocument({ summary }: { summary: ConsultationSummary | MedicalPreparationApiDto['summary'] }) {
  return <article className="nurse-summary-document"><header><strong>Hoooho</strong><span>{summary.memberName}｜病情摘要</span></header>{summary.sections.map((section) => <section key={section.id}><h3>{section.title}</h3><ul>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul></section>)}</article>
}

function SummaryResult({ feedback, preparation }: { feedback: string; preparation: MedicalPreparationApiDto }) {
  const shareUrl = `${window.location.origin}/medical-preparation/${preparation.shareToken}`
  return <div className="nurse-summary-result"><p className="nurse-summary-created"><Check />已自动保存到「就医准备」· 第 {preparation.version} 版</p><SummaryDocument summary={preparation.summary} /><HohoButton fullWidth onClick={() => window.open(shareUrl, '_blank')}><FileHeart />打开交互式摘要</HohoButton><HohoButton fullWidth onClick={() => void copyPromptText(shareUrl)} variant="secondary"><Share2 />复制私密查看链接</HohoButton>{feedback && <p className="nurse-summary-feedback">{feedback}</p>}</div>
}

export function formatUpdatedAt(value: string) {
  const date = new Date(value); const today = new Date()
  const prefix = date.toDateString() === today.toDateString() ? '今天' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
  return `${prefix} ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)}`
}
function StatusSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) { return <BottomSheetSurface label="就医准备" onClose={onClose} open title="就医准备">{children}</BottomSheetSurface> }
