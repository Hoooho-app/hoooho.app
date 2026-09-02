import { ArrowLeft, Check, ChevronRight, ClipboardList, Copy, FileText, HelpCircle, Image, ListChecks, Send, Share2, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { BottomSheetSurface, HealthCard, HohoButton, HohoSurfaceRow, StatusNotice, Typography } from '../../components/design-system'
import { copyPromptText, createHealthProfilePromptSections, type HealthEventPromptContext } from '../../features/ask-ai'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { ComingSoonPrompt } from '../HealthEventDetail/components'
import { buildConsultationSummary, getConsultationSummarySources, getDefaultConsultationSummarySelection, type ConsultationSummary, type ConsultationSummarySourceId } from './consultationSummary'
import './NurseNextAction.css'

interface NurseNextActionProps { currentMemberId: string; eventId: string | null; onClose: () => void; open: boolean }
type ActionCategory = 'ai' | 'hospital' | 'help'
type ConsultationView = 'selection' | 'result' | 'long-image' | 'prompt'
interface ActionFeature { actionLabel: string; description: string; icon: LucideIcon; id: string; preview: string[]; title: string }

const categoryContent: Record<Exclude<ActionCategory, 'ai'>, { description: string; features: ActionFeature[] }> = {
  hospital: {
    description: '为线下就医整理这条健康随记，方便挂号、候诊和现场沟通。',
    features: [
      { id: 'registration', title: '挂号前整理', description: '整理症状、既往情况、用药等基础信息。', actionLabel: '生成挂号信息', icon: ClipboardList, preview: ['主要症状与持续时间', '既往情况与当前用药', '需要补充的信息'] },
      { id: 'medical-summary', title: '生成就医摘要', description: '生成就医时间线和关键健康信息摘要。', actionLabel: '生成就医摘要', icon: FileText, preview: ['主要症状', '时间线', '体温与用药', '检查与状态变化'] },
      { id: 'doctor-questions', title: '整理想问医生的问题', description: '根据当前记录整理重点疑问和问题清单。', actionLabel: '生成问题清单', icon: HelpCircle, preview: ['症状持续多久', '哪些变化需要重点说明', '是否还需补充信息'] },
      { id: 'medical-list', title: '检查 / 用药清单', description: '整理这条健康随记中已经记录的检查和用药情况。', actionLabel: '生成清单', icon: ListChecks, preview: ['检查记录', '用药名称与时间', '待确认内容'] },
    ],
  },
  help: {
    description: '快速整理关键信息，方便向家人、朋友或其他人求助。',
    features: [
      { id: 'help-summary', title: '生成求助摘要', description: '整理这条健康随记的关键情况。', actionLabel: '生成求助摘要', icon: FileText, preview: ['发生了什么', '当前状态', '需要什么帮助'] },
      { id: 'help-poster', title: '生成求助海报', description: '将关键信息整理成便于转发的图文形式。', actionLabel: '生成求助海报', icon: Send, preview: ['关键信息卡片', '适合分享的图文布局'] },
      { id: 'key-information', title: '整理关键信息', description: '提炼这条健康随记中最重要的信息。', actionLabel: '整理关键信息', icon: ListChecks, preview: ['重要时间', '主要症状', '当前处理'] },
      { id: 'share-contact', title: '分享给家人 / 朋友', description: '将整理后的内容发送给指定联系人。', actionLabel: '分享', icon: Share2, preview: ['选择联系人', '分享内容预览'] },
    ],
  },
}

export function NurseNextAction({ currentMemberId, eventId, onClose, open }: NurseNextActionProps) {
  const { state, retry } = useHealthEventDetail(open ? eventId ?? undefined : undefined)
  const promptHealthProfile = useMemo(() => state.status === 'success' ? createHealthProfilePromptSections(getStoredHealthProfileSectionSnapshots(state.data.member.id)) : [], [state])
  if (!open) return null
  if (!eventId || state.status === 'loading') return <NextActionStatusSheet onClose={onClose}><StatusNotice title="正在准备下一步">正在读取当前健康随记…</StatusNotice></NextActionStatusSheet>
  if (state.status === 'error') return <NextActionStatusSheet onClose={onClose}><StatusNotice action={<HohoButton onClick={retry} size="small" variant="secondary">重新加载</HohoButton>} title="下一步加载失败" tone="error">{state.message}</StatusNotice></NextActionStatusSheet>
  if (state.status === 'not-found' || state.data.eventDto.memberId !== currentMemberId) return <NextActionStatusSheet onClose={onClose}><StatusNotice title="当前健康随记不可用" tone="error">请关闭后重试，或先在列表中确认当前人物的健康随记。</StatusNotice></NextActionStatusSheet>
  const event = state.data.viewModel.event
  const context: HealthEventPromptContext = {
    attachments: state.data.attachments,
    currentMemberId,
    event: { ...event, summary: state.data.eventDto.eventSummary?.displayedResult.summary ?? event.summary },
    healthProfile: promptHealthProfile,
    member: state.data.member,
    organizations: state.data.organizations,
    records: state.data.records,
    relatedEvents: state.data.relatedEvents,
  }
  return <LoadedNurseNextAction context={context} key={`${currentMemberId}:${eventId}`} onClose={onClose} />
}

function LoadedNurseNextAction({ context, onClose }: { context: HealthEventPromptContext; onClose: () => void }) {
  const sources = useMemo(() => getConsultationSummarySources(context), [context])
  const [category, setCategory] = useState<ActionCategory>('ai')
  const [view, setView] = useState<ConsultationView>('selection')
  const [selectedSources, setSelectedSources] = useState<ConsultationSummarySourceId[]>(() => getDefaultConsultationSummarySelection(context))
  const [summary, setSummary] = useState<ConsultationSummary | null>(null)
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [comingSoonOpen, setComingSoonOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [feedback, setFeedback] = useState('')
  const selectedFeature = category === 'ai' ? null : categoryContent[category].features.find(({ id }) => id === selectedFeatureId) ?? null
  const inExportView = category === 'ai' && (view === 'long-image' || view === 'prompt')
  const title = category !== 'ai' || view === 'selection' ? '下一步行动' : view === 'result' ? '问诊摘要' : view === 'long-image' ? '长图摘要' : '提示词摘要'

  const selectCategory = (next: ActionCategory) => { setCategory(next); setSelectedFeatureId(null); setFeedback('') }
  const toggleSource = (id: ConsultationSummarySourceId) => {
    const source = sources.find((item) => item.id === id)
    if (!source?.available || source.required) return
    setSelectedSources((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }
  const generate = async () => {
    setGenerating(true); setFeedback('')
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    try { setSummary(buildConsultationSummary(context, selectedSources)); setView('result'); setExpanded(false) }
    catch (error) { setFeedback(error instanceof Error ? error.message : '问诊摘要生成失败，请稍后重试') }
    finally { setGenerating(false) }
  }
  const copyPrompt = async () => {
    if (!summary) return
    const result = await copyPromptText(summary.prompt)
    setFeedback(result.ok ? '已复制' : result.message)
  }
  const saveLongImage = async () => {
    if (!summary) return
    setFeedback('')
    try {
      const { saveConsultationSummaryLongImage } = await import('./consultationSummaryLongImage')
      const mode = await saveConsultationSummaryLongImage(summary)
      setFeedback(mode === 'opened' ? '长图已打开，请长按图片保存' : '长图已下载，请在下载中保存到相册')
    } catch (error) { setFeedback(error instanceof Error ? error.message : '长图保存失败，请稍后重试') }
  }
  const navigation = inExportView ? undefined : <div aria-label="行动场景" className="health-action-tabs" role="tablist">{([['ai', '去问 AI'], ['hospital', '去医院'], ['help', '去求助']] as const).map(([id, label]) => <button aria-selected={category === id} className="health-action-tab" data-selected={category === id} key={id} onClick={() => selectCategory(id)} role="tab" type="button">{label}</button>)}</div>
  const leading = inExportView ? <button aria-label="返回问诊摘要" className="hoho-bottom-sheet__back" onClick={() => { setView('result'); setFeedback('') }} type="button"><ArrowLeft size={20} /></button> : undefined
  const footer = category === 'ai'
    ? view === 'selection'
      ? <div className="grid gap-2"><HohoButton fullWidth loading={generating} onClick={() => void generate()}>{generating ? '正在生成…' : '生成问诊摘要'}</HohoButton>{feedback && <ActionFeedback message={feedback} />}</div>
      : view === 'long-image'
        ? <div className="grid gap-2"><HohoButton fullWidth onClick={() => void saveLongImage()}>保存到相册</HohoButton>{feedback && <ActionFeedback message={feedback} />}</div>
        : view === 'prompt'
          ? <div className="grid gap-2"><HohoButton fullWidth onClick={() => void copyPrompt()}>复制提示词</HohoButton>{feedback && <ActionFeedback message={feedback} />}</div>
          : undefined
    : selectedFeature ? <HohoButton fullWidth onClick={() => setComingSoonOpen(true)}>{selectedFeature.actionLabel}</HohoButton> : undefined

  return <>
    <BottomSheetSurface className="health-action-sheet nurse-next-action-sheet" footer={footer} label={title} leading={leading} navigation={navigation} onClose={onClose} open size="workspace" title={title}>
      {category === 'ai'
        ? view === 'selection' ? <SummarySelection selected={selectedSources} sources={sources} toggle={toggleSource} />
          : view === 'result' && summary ? <SummaryResult expanded={expanded} onAdjust={() => { setView('selection'); setFeedback('') }} onExpand={() => setExpanded((value) => !value)} onLongImage={() => { setView('long-image'); setFeedback('') }} onPrompt={() => { setView('prompt'); setFeedback('') }} summary={summary} />
            : view === 'long-image' && summary ? <LongImagePreview summary={summary} />
              : view === 'prompt' && summary ? <PromptPreview summary={summary} /> : null
        : <ExistingActionCategory category={category} onBack={() => setSelectedFeatureId(null)} onSelect={setSelectedFeatureId} selectedFeature={selectedFeature} />}
    </BottomSheetSurface>
    <ComingSoonPrompt onClose={() => setComingSoonOpen(false)} open={comingSoonOpen} />
  </>
}

function SummarySelection({ selected, sources, toggle }: { selected: ConsultationSummarySourceId[]; sources: ReturnType<typeof getConsultationSummarySources>; toggle: (id: ConsultationSummarySourceId) => void }) {
  return <section className="nurse-summary-selection"><div className="nurse-summary-selection__heading"><span>选择要生成的信息</span><strong>已选择 {selected.length} 项</strong></div><div className="nurse-summary-options">{sources.map((source) => {
    const checked = selected.includes(source.id)
    return <button aria-checked={checked} className="nurse-summary-option" data-available={source.available} data-checked={checked} disabled={!source.available || source.required} key={source.id} onClick={() => toggle(source.id)} role="checkbox" type="button"><span>{source.label}</span>{!source.available ? <small>暂无内容</small> : <span aria-hidden="true" className="nurse-summary-check">{checked && <Check size={16} strokeWidth={2.4} />}</span>}</button>
  })}</div></section>
}

function SummaryResult({ expanded, onAdjust, onExpand, onLongImage, onPrompt, summary }: { expanded: boolean; onAdjust: () => void; onExpand: () => void; onLongImage: () => void; onPrompt: () => void; summary: ConsultationSummary }) {
  return <div className="nurse-summary-result"><p className="nurse-summary-created"><Check aria-hidden="true" size={16} />已根据 {summary.selectedSourceIds.length} 项信息生成</p><SummaryDocument compact={!expanded} summary={summary} /><button className="nurse-summary-expand" onClick={onExpand} type="button">{expanded ? '收起摘要' : '查看完整摘要'}</button><section className="nurse-summary-export"><Typography variant="label">导出方式</Typography><div className="nurse-summary-export__list"><HohoSurfaceRow leading={<Image aria-hidden="true" size={20} />} onActivate={onLongImage} title="保存为长图" /><HohoSurfaceRow leading={<Copy aria-hidden="true" size={20} />} onActivate={onPrompt} title="复制为提示词" /></div></section><HohoButton className="nurse-summary-adjust" onClick={onAdjust} variant="text">返回调整</HohoButton></div>
}

function SummaryDocument({ compact = false, summary }: { compact?: boolean; summary: ConsultationSummary }) {
  const sections = compact ? summary.sections.map((section) => ({ ...section, lines: section.lines.slice(0, 2) })) : summary.sections
  return <article className="nurse-summary-document"><header><strong>Hoooho</strong><span>{summary.memberName}｜本人</span></header>{sections.map((section) => <section key={section.id}><h3>{section.title}</h3><ul>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul></section>)}</article>
}

function LongImagePreview({ summary }: { summary: ConsultationSummary }) { return <div className="nurse-summary-export-view"><p className="nurse-summary-export-hint">这是一张独立长图，不包含页面导航和操作按钮。</p><SummaryDocument summary={summary} /><p className="nurse-summary-disclaimer">信息由本人记录，仅供沟通参考</p></div> }
function PromptPreview({ summary }: { summary: ConsultationSummary }) { return <div className="nurse-summary-export-view"><p className="nurse-summary-export-hint">复制后可直接粘贴到其他 AI</p><article aria-label="提示词内容" className="nurse-summary-prompt">{summary.prompt}</article></div> }

function ExistingActionCategory({ category, onBack, onSelect, selectedFeature }: { category: Exclude<ActionCategory, 'ai'>; onBack: () => void; onSelect: (id: string) => void; selectedFeature: ActionFeature | null }) {
  const content = categoryContent[category]
  if (selectedFeature) return <div><button className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary" onClick={onBack} type="button"><ArrowLeft size={17} />返回</button><Typography className="mt-2" variant="sectionTitle">{selectedFeature.title}</Typography><Typography className="mt-2" variant="body">{selectedFeature.description}</Typography><HealthCard className="mt-5 shadow-none"><Typography variant="label">内容预览</Typography><ul className="mt-3 grid gap-3">{selectedFeature.preview.map((item) => <li className="flex items-center gap-2 text-sm text-text-secondary" key={item}><span className="h-1.5 w-1.5 rounded-full bg-primary" />{item}</li>)}</ul></HealthCard></div>
  return <div><Typography variant="body">{content.description}</Typography><div className="health-action-list mt-4 overflow-hidden rounded-card border bg-surface">{content.features.map((feature) => { const Icon = feature.icon; return <button className="hoho-surface-row" key={feature.id} onClick={() => onSelect(feature.id)} type="button"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={19} strokeWidth={1.8} /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{feature.title}</strong><span className="mt-1 block text-xs leading-5 text-text-secondary">{feature.description}</span></span><ChevronRight className="shrink-0 text-text-secondary" size={19} /></button> })}</div></div>
}

function ActionFeedback({ message }: { message: string }) { return <p aria-live="polite" className="nurse-summary-feedback" role="status">{message}</p> }
function NextActionStatusSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) { return <BottomSheetSurface label="下一步行动" onClose={onClose} open title="下一步行动">{children}</BottomSheetSurface> }
