import { ArrowLeft, Download, FileText, List, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BottomSheetSurface,
  HohoButton,
  StatusNotice,
} from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import {
  visitSheetService,
  type VisitSheetUpdate,
} from '../../services/visitSheets'
import { healthEventService } from '../../services/healthEvents'
import type {
  VisitChapterId,
  VisitFocus,
  VisitSheet,
  VisitSheetState,
  VisitSource,
} from '../../types/visitSheet'
import { SourceRecordEditor } from './SourceRecordEditor'
import { ApiRequestError } from '../../services/apiClient'
import { ReportChapter, reportTime, SourceText, sourceCategoryLabel } from './ReportChapter'
import { downloadReport, printReport, reportText, doctorBriefText, downloadContent, type ExportResources } from './reportExport'
import { ReportPhotos, PhotoPicker, PhotoViewer, readPhoto } from './ReportPhotos'
import './report.css'
import { ReportDirectory } from './ReportDirectory'
import nursePortrait from '../../assets/nurse-triage/nurse-station-idle-1-poster.webp'
import { MedicalAISummary } from './MedicalAISummary'
import { AIResultPreview, type AIUnverifiedPreview } from '../../features/ai-business/AIResultPreview'
import { preliminarySummaryExport } from './preliminarySummaryExport'
import { consultationPrompt, doctorQuestionTemplates } from '../../features/ai-business/consultationPrompt'
import { ReportScopeSheet } from '../../features/case-continuity/ReportScopeSheet'
import { matchingSources } from './reportCopy'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
export { VisitSummaryContent, formatVisitTime } from './LegacyVisitSummary'

export function VisitSummaryPage() {
  const memberId = useAppStore((s) => s.currentMemberId),
    token = useAppStore((s) => s.authToken ?? '')
  const { eventId } = useParams()
  return (
    <VisitSheetReader
      key={`${memberId}:${token}:${eventId ?? ''}`}
      memberId={memberId}
      token={token}
      eventId={eventId}
    />
  )
}
function VisitSheetReader({
  memberId,
  token,
  eventId,
}: {
  memberId: string
  token: string
  eventId?: string
}) {
  const navigate = useNavigate(),
    controller = useRef<AbortController | null>(null),
    busy = useRef(false),
    alive = useRef(true)
  const [state, setState] = useState<VisitSheetState | null>(null),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [aiWorking, setAIWorking] = useState(false),
    [aiFailed, setAIFailed] = useState(false),
    [error, setError] = useState('')
  const [active, setActive] = useState<VisitChapterId>('overview'),
    [menu, setMenu] = useState(false),
    [editing, setEditing] = useState<'focus' | 'question' | null>(null),
    [exporting, setExporting] = useState(false)
  const [evidence, setEvidence] = useState<string[] | null>(null),
    [sourceEdit, setSourceEdit] = useState<VisitSource | null>(null),
    [search, setSearch] = useState(''),
    [notice, setNotice] = useState('')
  const [photoPicker,setPhotoPicker]=useState(false),[photoId,setPhotoId]=useState<string|null>(null)
  const parentEvidence=useRef<string[]|null>(null)
  const [scopeOpen,setScopeOpen] = useState(false)
  const [scopeUndo,setScopeUndo] = useState<{selection:VisitSheetUpdate['selection']}|null>(null)
  const pendingSave=useRef<{key:string;requestId:string}|null>(null)
  const [aiPreview,setAIPreview]=useState<AIUnverifiedPreview|null>(null),[previewText,setPreviewText]=useState('')
  const [aiCandidate,setAICandidate]=useState<VisitSheetState['aiCandidate']>(),[candidateOverview,setCandidateOverview]=useState('')
  const modalTrigger=useRef<HTMLElement|null>(null)
  const scroll = useRef<HTMLDivElement>(null),
    version = useRef(0)
  const report = state?.report ?? null
  const modalOpen = !!(menu || editing || exporting || evidence || sourceEdit || photoPicker || photoId || scopeOpen)
  useEffect(()=>{document.body.classList.add('visit-report-active');return()=>document.body.classList.remove('visit-report-active')},[])
  useEffect(()=>{if(modalOpen&&!modalTrigger.current)modalTrigger.current=document.activeElement as HTMLElement;if(scroll.current){scroll.current.inert=modalOpen;scroll.current.style.overflowY=modalOpen?'hidden':'auto'}if(!modalOpen&&modalTrigger.current)requestAnimationFrame(()=>modalTrigger.current?.focus({preventScroll:true}))},[modalOpen])
  const accept = (result: VisitSheetState) => {
    if (!alive.current) return
    setAICandidate(undefined);setCandidateOverview('');setAIPreview(null);setPreviewText('')
    version.current = result.report?.version ?? version.current
    setState(result)
  }
  async function load() {
    if (!memberId || !token) {
      setLoading(false)
      setError('请先选择当前孩子')
      return
    }
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    setLoading(true)
    setError('')
    try {
      let caseFocus: VisitSheetUpdate['focus'] | undefined
      if (eventId) {
        const event = await healthEventService.getById(eventId, token, c.signal)
        if (event.memberId !== memberId)
          throw new Error(
            '记录与当前孩子不一致，请从当前孩子的情况单入口重新打开',
          )
        caseFocus = { mode: 'custom', text: event.title, caseEventId: event.id }
      }
      const result = await visitSheetService.get(memberId, token, c.signal)
      if (c.signal.aborted) return
      version.current = result.report?.version ?? result.expectedVersion ?? 0
      if (result.report && (!caseFocus || result.report.focus.caseEventId === eventId)) accept(result)
      else {
        const generated = await visitSheetService.save(
          memberId,
          token,
          { expectedVersion: version.current, requestId: crypto.randomUUID(), ...(caseFocus ? { focus: caseFocus, selection:{eventIds:[eventId!],includeBackground:false} } : {}) },
          c.signal,
        )
        if (!c.signal.aborted) accept(generated)
      }
    } catch (reason) {
      if (!c.signal.aborted && alive.current) {
        if (reason instanceof ApiRequestError && reason.status === 409) {
          try {
            accept(await visitSheetService.get(memberId, token, c.signal))
          } catch {
            setError('资料读取失败，请重试')
          }
        } else
          setError(
            reason instanceof Error && !/abort|fetch|timeout|timed out/i.test(reason.message)
              ? reason.message
              : '情况单读取超时或连接中断，请重试。已有资料未修改。',
          )
      }
    } finally {
      if (!c.signal.aborted && alive.current) setLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
      controller.current?.abort()
    }
  }, [])
  async function update(changes: Partial<VisitSheetUpdate> = {}) {
    if (busy.current) return false
    busy.current = true
    setWorking(true)
    setAIWorking(changes.generateAI === true)
    setAIFailed(false)
    setNotice('')
    setError('')
    try {
      const key=JSON.stringify(changes)
      if(pendingSave.current?.key!==key)pendingSave.current={key,requestId:crypto.randomUUID()}
      const result = await visitSheetService.save(
        memberId,
        token,
        {
          ...changes,
          ...(changes.generateAI?{previewAI:true}:{}),
          expectedVersion: version.current,
          requestId: pendingSave.current.requestId,
        },
        controller.current?.signal,
      )
      if (!alive.current) return false
      if(result.aiCandidate){setAICandidate(result.aiCandidate);setCandidateOverview(result.aiCandidate.summary.overview);setAIPreview(null);setPreviewText('');setAIFailed(false);pendingSave.current=null;setNotice('AI 病情摘要草稿已返回，核对并确认后才保存');return true}
      accept(result)
      if(changes.confirmAI){setAICandidate(undefined);setCandidateOverview('')}
      if (changes.generateAI) {setAIFailed(false);setAIPreview(null);setPreviewText('')}
      pendingSave.current=null
      setNotice(changes.generateAI ? 'AI 病情摘要已生成' : '情况单已更新')
      return true
    } catch (reason) {
      if (alive.current) {
        if (changes.generateAI) {setAIFailed(true);if(reason instanceof ApiRequestError&&reason.preview){setAIPreview(reason.preview);setPreviewText(reason.preview.text)}}
        if (reason instanceof ApiRequestError && reason.status === 409) {
          try {
            accept(
              await visitSheetService.get(
                memberId,
                token,
                controller.current?.signal,
              ),
            )
          } catch {
            /* Keep the current report and editor input. */
          }
        }
        setError(
          `${reason instanceof Error&&!/abort|fetch|timeout|timed out/i.test(reason.message) ? reason.message : '保存结果暂未确认，请重试核验'}。原报告仍可阅读，填写内容保留。`,
        )
      }
      return false
    } finally {
      busy.current = false
      if (alive.current) setWorking(false)
      if (alive.current) setAIWorking(false)
    }
  }
  const chooseChapter = (id: VisitChapterId) => {
    setActive(id)
    setMenu(false)
    setSearch('')
    requestAnimationFrame(() =>
      scroll.current?.querySelector(`#chapter-${id}`)?.scrollIntoView({block:'start'}),
    )
  }
  const openEvidence = (ids: string[]) => {
    setEvidence(ids)
    setError('')
  }
  const sources = report?.sources ?? []
  return (
    <main className="visit-report" data-visit-sheet-root onClickCapture={event=>{if(!modalOpen){const trigger=(event.target as Element).closest<HTMLElement>('button,a,input');if(trigger)modalTrigger.current=trigger}}}>
      <header className="visit-report-header">
        <button aria-label="返回" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <strong>就诊情况单</strong>
        <button
          aria-label="章节目录"
          disabled={!report?.sources.length}
          onClick={() => setMenu(true)}
        >
          <List size={21} />
        </button>
        <button
          aria-label="导出情况单"
          disabled={!report?.sources.length}
          onClick={() => setExporting(true)}
        >
          <Download size={20} />
        </button>
      </header>
      <div
        className="visit-report-scroll"
        data-scroll-container
        ref={scroll}
        onScroll={(e) => {
          if (e.currentTarget.scrollLeft) e.currentTarget.scrollLeft = 0
          const top=e.currentTarget.getBoundingClientRect().top
          const current=[...e.currentTarget.querySelectorAll<HTMLElement>('.visit-chapter')].reverse().find(el=>el.getBoundingClientRect().top<=top+100)
          if(current)setActive(current.id.replace('chapter-','') as VisitChapterId)
        }}
      >
        {loading && !report ? (
          <section className="visit-report-state" role="status">
            <FileText size={36} />
            <h1>正在整理已有记录</h1>
            <p>读取当前孩子的真实资料，整理病情、经过与依据。</p>
          </section>
        ) : null}
        {error && (
          <StatusNotice
            title={report ? '更新未完成' : '情况单暂时无法打开'}
            tone="error"
            action={
              !report ? (
                <HohoButton onClick={() => void load()}>重试</HohoButton>
              ) : aiFailed ? <HohoButton disabled={working} onClick={() => void update({ generateAI: true })}>重试 AI 摘要</HohoButton> : undefined
            }
          >
            {error}
          </StatusNotice>
        )}
        {report && (
          <>
            <div className="visit-report-person">
              <span className="visit-person-monogram">
                {report.member.name.slice(0, 1)}
              </span>
              <div>
                <strong>{report.member.name}</strong>
                <p>
                  {report.member.gender === 'female'
                    ? '女'
                    : report.member.gender === 'male'
                      ? '男'
                      : '性别未填写'}
                  {report.member.birthday
                    ? ` · ${formatAgeFromBirthday(report.member.birthday,new Date(report.dataAsOf),report.timezone)}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="visit-nurse-signature"><img src={nursePortrait} alt="Hoooho 虚拟护士"/><div><p>由 Hoooho 虚拟护士整理 · 依据家长记录</p><small>本地事实整理 · 资料截至 {reportTime(report.dataAsOf, report.timezone)} · 非医护审核</small></div></div>
            {state?.stale && (
              <StatusNotice
                title="有新资料待同步"
                action={
                  <HohoButton
                    loading={working}
                    onClick={() => void update()}
                    size="small"
                  >
                    更新情况单
                  </HohoButton>
                }
              >
                当前保留上一次成功生成的版本。
              </StatusNotice>
            )}
            {Array.from(
              new Set([...(state?.warnings ?? []), ...report.warnings]),
            ).map((w) => (
              <StatusNotice title={w} tone="warning" key={w} />
            ))}
            {!sources.length && <section className="visit-report-state"><h2>病情数据</h2><p>{report.selection?'所选范围没有可用资料；不代表孩子没有其他记录。':'当前孩子尚无已保存资料。'}</p><HohoButton onClick={()=>setScopeOpen(true)}>调整 / 恢复资料范围</HohoButton><HohoButton variant="text" onClick={()=>navigate('/health-events')}>补充健康记录</HohoButton></section>}
            {!!sources.length && report.chapters.map(chapter=><ReportChapter key={chapter.id} chapter={chapter} report={report} onEvidence={openEvidence} action={chapter.id==='overview'?<div className="visit-focus-actions"><button onClick={()=>{setError('');setEditing('focus')}}>更改主诉</button><button onClick={()=>{setError('');setScopeOpen(true)}}>资料范围</button></div>:undefined} leading={chapter.id==='overview'? <>
              <section className="visit-report-focus">
                <h1>{report.complaint}</h1>
                <p className="visit-focus-meta">{report.focus.mode==='custom'?'家长本次陈述':`${report.candidates.find(c=>c.sourceId===report.complaintSourceId)?.timeKind || '记录时间'} ${reportTime(report.candidates.find(c=>c.sourceId===report.complaintSourceId)?.at??null)}`}</p>
              </section>
              <ReportPhotos report={report} token={token} onChoose={()=>setPhotoPicker(true)} onOpen={setPhotoId}/>
              <section className="visit-question"><div className="visit-section-actions"><h2>本次想问</h2><button onClick={()=>{setError('');setEditing('question')}}>编辑本次想问</button></div><p>{report.question||'尚未填写'}</p><small>{report.questionOrigin||'家长填写'}</small>{!!report.questionSourceIds?.length&&<button className="visit-text-action" onClick={()=>openEvidence(report.questionSourceIds!)}>查看问题原话</button>}</section>
              <section className="visit-question">
                <HohoButton loading={aiWorking} disabled={working || !sources.length} onClick={() => void update({ generateAI: true })}>{aiWorking ? '正在生成 AI 病情摘要' : report.aiSummary ? '重新生成 AI 病情摘要' : '生成 AI 病情摘要'}</HohoButton>
                {!report.aiSummary && <p className="visit-muted">AI 摘要尚未生成，下方本地事实仍可查看和导出。</p>}
              </section>
              <MedicalAISummary report={report}/>
              {aiCandidate&&<section aria-label="AI病情摘要待确认"><h3>AI病情摘要草稿 · 待确认</h3><p>程序核对通过，尚未保存；请对照每条引用核对事实。</p><details><summary>技术详情</summary><small>{aiCandidate.summary.provider} · {aiCandidate.summary.model}</small></details><label>修改摘要概述<textarea aria-label="修改摘要概述" maxLength={1000} value={candidateOverview} onChange={e=>setCandidateOverview(e.target.value)}/></label><ul>{aiCandidate.summary.keyPoints.map((point,i)=><li key={i}>{point}<details><summary>核对引用原话</summary><p>{aiCandidate.summary.keyPointEvidence?.[i]?.quote}</p></details></li>)}</ul><HohoButton disabled={working||!candidateOverview.trim()} onClick={()=>void update({confirmAI:aiCandidate.id,aiOverview:candidateOverview})}>已核对，保存AI摘要</HohoButton><HohoButton variant="secondary" onClick={()=>setAICandidate(undefined)}>不保存这份摘要</HohoButton></section>}
              {aiPreview&&<AIResultPreview preview={aiPreview} value={previewText} onChange={setPreviewText} compactDiagnostics><p>这是独立预览，未保存为正式摘要；下方旧摘要与本地整理保持不变。</p><HohoButton variant="secondary" disabled={!previewText.trim()} onClick={()=>downloadContent(preliminarySummaryExport(previewText,aiPreview,'text'),'Hoooho-AI初步摘要-待核对.txt','text/plain;charset=utf-8')}>导出待核对摘要（文本）</HohoButton><HohoButton variant="secondary" disabled={!previewText.trim()} onClick={()=>downloadContent(preliminarySummaryExport(previewText,aiPreview,'html'),'Hoooho-AI初步摘要-待核对.html','text/html;charset=utf-8')}>导出待核对摘要（离线HTML）</HohoButton></AIResultPreview>}
              </>:undefined} trailing={<>
            {chapter.id === 'sources' && (
              <>
                <div className="visit-source-categories">{report.sourceGroups?.map(group=><button key={group.category} onClick={()=>{const detail=scroll.current?.querySelector<HTMLDetailsElement>('[data-all-sources]');if(detail){detail.open=true;requestAnimationFrame(()=>scroll.current?.querySelector(`[data-source-category="${group.category}"]`)?.scrollIntoView({block:'start'}))}}}>{sourceCategoryLabel(group.category)} · {group.sourceIds.length} ›</button>)}</div>
                <details className="visit-chapter-details" data-all-sources><summary>查看全部 {sources.length} 项来源</summary>
                <label className="visit-source-search">
                  检索全部资料
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索原文、日期或来源"
                  />
                </label>
                <p className="visit-muted">
                  {report.scope} 搜索只影响阅读；导出照片范围另行核对。
                </p>
                <p role="status">{search.trim()?`匹配 ${matchingSources(sources,search).length} / ${sources.length} 项资料`:`共 ${sources.length} 项资料`}</p>
                {[...new Set(matchingSources(sources,search).map(s=>s.category))].map(category=><section className="visit-source-group" data-source-category={category} key={category}>
                <h3>{sourceCategoryLabel(category)} · {matchingSources(sources,search).filter(s=>s.category===category).length} 项资料</h3>
                <p className="visit-muted">资料项数不等于症状次数、服药次数或病情程度。</p>
                {matchingSources(sources,search).filter(s=>s.category===category)
                  .map((s) => (
                    <button
                      className="visit-source-row"
                      key={s.id}
                      onClick={() => openEvidence([s.id])}
                    >
                      <FileText size={18} />
                      <span>
                        <strong>{s.title}</strong>
                        <small>
                          {s.code} · {s.identity} ·{' '}
                          {reportTime(
                            s.occurredAt || s.createdAt,
                            report.timezone,
                          )}
                        </small>
                      </span>
                      <span>›</span>
                    </button>
                  ))}</section>)}
                {report.changes.length > 0 && (
                  <details className="visit-change-history">
                    <summary>查看修改记录（{report.changes.length}）</summary>
                    {report.changes.map((c, i) => (
                      <article key={i}>
                        <p>
                          {reportTime(c.at)} · {sources.find(s=>s.id===c.sourceId)?.code ?? '家长报告编辑'}
                        </p>
                        <p>修改前：{c.before}</p>
                        <p>修改后：{c.after}</p>
                      </article>
                    ))}
                  </details>
                )}
                </details>
              </>
            )}
            </>}/>)}
            <footer className="visit-report-footer">
              <p>来自已保存的资料，用于就医沟通。</p>
              <button disabled={working} onClick={() => void update()}>
                <RefreshCw size={14} />
                {working ? '正在更新，原报告仍可阅读' : '重新整理已有记录'}
              </button>
            </footer>
          </>
        )}
        {notice && (
          <p role="status" className="visit-muted">
            {notice}
          </p>
        )}
      </div>
      {menu&&report&&<ReportDirectory chapters={report.chapters} active={active} onClose={()=>setMenu(false)} onChoose={chooseChapter}/>}
      {report && scopeOpen && <ReportScopeSheet initial={report.selection} memberId={memberId} token={token} version={report.version} busy={working} error={error} onClose={()=>{if(!working)setScopeOpen(false)}} onSave={async selection=>{const previous=report.selection??null;if(await update({selection})){setScopeUndo({selection:previous});setScopeOpen(false)}}} onUndo={scopeUndo?async()=>{if(await update({selection:scopeUndo.selection})){setScopeUndo(null);setScopeOpen(false)}}:undefined}/>}
      {report && editing && (
        <ReportEditor
          report={report}
          kind={editing}
          working={working}
          error={error}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            const success = await update(changes)
            if (success) {
              setEditing(null)
              if (changes.focus) {
                chooseChapter('overview')
              }
            }
            return success
          }}
        />
      )}
      {report && evidence && (
        <BottomSheetSurface
          open
          label="原始依据"
          title="原始依据"
          size="workspace"
          onClose={() => setEvidence(null)}
        >
          {sources
            .filter((s) => evidence.includes(s.id))
            .map((s) => (
              <article className="visit-evidence-entry" key={s.id}>
                <SourceText source={s} />
                <p className="visit-muted">
                  用于：
                  {s.destinations
                    .map(
                      (id) => report.chapters.find((c) => c.id === id)?.title,
                    )
                    .join('、')}
                </p>
                {(s.attachmentId || s.contentPath) && (
                  <AttachmentPreview source={s} token={token} />
                )}
                {sources
                  .filter(
                    (a) =>
                      a.attachmentId &&
                      a.recordId &&
                      a.recordId === s.recordId &&
                      a.id !== s.id,
                  )
                  .map((a) => (
                    <AttachmentPreview source={a} token={token} key={a.id} />
                  ))}
                {s.recordId && s.eventId && (
                  <HohoButton
                    variant="text"
                    onClick={() => {
                      parentEvidence.current=evidence
                      setEvidence(null)
                      setSourceEdit(s)
                    }}
                  >
                    查看 / 修改原始记录
                  </HohoButton>
                )}
                {s.profileSection && (
                  <HohoButton
                    variant="text"
                    onClick={() =>
                      navigate(`/health-profile/${s.profileSection}`)
                    }
                  >
                    打开健康档案原文
                  </HohoButton>
                )}
              </article>
            ))}
        </BottomSheetSurface>
      )}
      {sourceEdit?.eventId && sourceEdit.recordId && (
        <SourceRecordEditor
          memberId={memberId}
          token={token}
          eventId={sourceEdit.eventId}
          recordId={sourceEdit.recordId}
          onClose={() => {setSourceEdit(null);setEvidence(parentEvidence.current);parentEvidence.current=null}}
          onChanged={() => {
            setNotice('原始记录已保存，正在更新情况单')
            void update()
          }}
        />
      )}
      {report && exporting && (
        <ExportSheet report={report} token={token} memberId={memberId} onRefresh={()=>update()} onClose={() => setExporting(false)} />
      )}
      {report&&photoPicker&&<PhotoPicker key={`${memberId}:${report.photoKey}`} memberId={memberId} report={report} token={token} working={working} error={error} onClose={()=>setPhotoPicker(false)} onSave={async changes=>{const success=await update(changes);if(success)setPhotoPicker(false);return success}}/>}
      {report&&photoId&&<PhotoViewer report={report} token={token} id={photoId} onClose={()=>setPhotoId(null)}/>}
    </main>
  )
}

function ReportEditor({
  report,
  kind,
  working,
  error,
  onClose,
  onSave,
}: {
  report: VisitSheet
  kind: 'focus' | 'question'
  working: boolean
  error: string
  onClose: () => void
  onSave: (changes: Partial<VisitSheetUpdate>) => Promise<boolean>
}) {
  const [focus, setFocus] = useState<VisitFocus>(report.focus),
    [custom, setCustom] = useState(report.focus.text ?? ''),
    [question, setQuestion] = useState(report.question),
    [query, setQuery] = useState(''),
    [confirmExit, setConfirmExit] = useState(false)
  const dirty =
    JSON.stringify(focus) !== JSON.stringify(report.focus) ||
    custom !== (report.focus.text ?? '') ||
    question !== report.question
  const close = () => {
    if (working) return
    if (dirty) setConfirmExit(true)
    else onClose()
  }
  const changes =
    kind === 'focus'
      ? {
          focus:
            focus.mode === 'custom'
              ? { mode: 'custom' as const, text: custom.trim() }
              : focus,
        }
      : { question }
  const valid = kind !== 'focus' || focus.mode !== 'custom' || !!custom.trim()
  // Group exact equivalent labels only; never merge different symptoms by guesswork.
  const groups=[...new Set(report.candidates.map(c=>c.text.trim()))].map(text=>report.candidates.filter(c=>c.text.trim()===text))
  return (
    <BottomSheetSurface
      open
      label={kind === 'focus' ? '更改主诉' : '编辑本次想问'}
      title={kind === 'focus' ? '这次主要想了解什么？' : '本次想问'}
      onClose={close}
      size="workspace"
      footer={
        <HohoButton
          fullWidth
          disabled={!valid}
          loading={working}
          onClick={() => void onSave(changes)}
        >
          保存并更新情况单
        </HohoButton>
      }
    >
      <div className="visit-report-editor">
        {kind === 'focus' ? (
          <>
            <label className="visit-focus-option"><input type="radio" name="focus" checked={focus.mode==='custom'} onChange={()=>setFocus({mode:'custom',text:custom})}/><strong>自己描述</strong></label>
            <label>本次主诉（家长陈述）<textarea value={custom} maxLength={1000} placeholder="用自己的话描述这次想了解的问题" onChange={e=>{setCustom(e.target.value);setFocus({mode:'custom',text:e.target.value})}}/></label>
            <label className="visit-focus-option">
              <input
                type="radio"
                name="focus"
                checked={focus.mode === 'auto'}
                onChange={() => setFocus({ mode: 'auto' })}
              />
              <span>
                <strong>自动按最新症状整理</strong>
                <small>后续更新随最近有效症状调整</small>
                <small>{report.candidates[0]?`${report.candidates[0].text} · ${reportTime(report.candidates[0].at,report.timezone)}`:'暂无有效症状'}</small>
              </span>
            </label>
            <h3>从已记录的症状选择</h3><label>搜索症状、部位或关键词<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索，例如：前臂、皮疹"/></label>
            {!report.candidates.some(c=>[c.text,report.sources.find(s=>s.id===c.sourceId)?.text].join(' ').toLowerCase().includes(query.toLowerCase()))&&<p>没有匹配症状，可以在上方自己描述。当前选择不会因搜索改变。</p>}
            {groups.filter(group=>group.some(c=>[c.text,report.sources.find(s=>s.id===c.sourceId)?.text].join(' ').toLowerCase().includes(query.toLowerCase()))).map((group) => {const c=group[0];return (
              <label className="visit-focus-option" key={c.sourceId}>
                <input
                  type="radio"
                  name="focus"
                  checked={
                    focus.mode === 'source' && group.some(c=>focus.sourceId===c.sourceId)
                  }
                  onChange={() =>
                    setFocus({ mode: 'source', sourceId: c.sourceId })
                  }
                />
                <span>
                  <strong>{c.text}</strong>
                  <small>
                    {group.length} 条同文记录 · 最近 {c.timeKind} · {reportTime(c.at, report.timezone)}
                  </small>
                </span>
              </label>
            )})}
            <p className="visit-muted">
              调整报告焦点，原始资料保留。手写问题保留，请确认是否仍适用。
            </p>
          </>
        ) : (
          <>
              <label>
                本次想问
                <textarea
                  aria-label="本次想问"
                  value={question}
                  maxLength={5000}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </label>
              <div className="visit-section-actions">{doctorQuestionTemplates.map(template=><button type="button" aria-label={`添加问题：${template}`} key={template} onClick={()=>setQuestion(previous=>previous?`${previous}\n${template}`:template)}>{template}</button>)}</div>
            <p className="visit-muted">
              标为家长陈述，仅保存到报告，不覆盖原始记录。
            </p>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {confirmExit && (
          <div role="alert">
            <p>还有未保存的内容</p>
            <HohoButton
              disabled={!valid}
              loading={working}
              onClick={() => void onSave(changes)}
            >
              保存
            </HohoButton>
            <HohoButton variant="secondary" onClick={onClose}>
              放弃修改
            </HohoButton>
            <HohoButton variant="text" onClick={() => setConfirmExit(false)}>
              继续编辑
            </HohoButton>
          </div>
        )}
      </div>
    </BottomSheetSurface>
  )
}
function AttachmentPreview({
  source,
  token,
}: {
  source: VisitSource
  token: string
}) {
  const [url, setUrl] = useState(''),
    [image, setImage] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  const request=useRef<AbortController|null>(null)
  useEffect(()=>()=>request.current?.abort(),[])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  const load = async () => {
    request.current?.abort()
    const controller=new AbortController();request.current=controller
    setLoading(true)
    setError('')
    try {
      const result = await fetch(
        source.contentPath && /^\/api\/members\/[^/]+\/visit-sheet\/resources\/[a-f0-9]{24}$/.test(source.contentPath) ? source.contentPath : `/api/events/${encodeURIComponent(source.eventId!)}/attachments/${encodeURIComponent(source.attachmentId!)}/content`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),
        },
      )
      if (!result.ok) throw new Error('附件读取失败，可重试')
      const blob=await result.blob()
      if(controller.signal.aborted)return
      setImage(blob.type.startsWith('image/'))
      setUrl(URL.createObjectURL(blob))
    } catch {
      if(!controller.signal.aborted)setError('附件读取失败，原件信息仍保留，请重试')
    } finally {
      if(!controller.signal.aborted)setLoading(false)
    }
  }
  return (
    <div className="visit-attachment">
      <strong>{source.title}</strong>
      {url ? (
        <>
          {image && <img
            src={url}
            alt={source.title}
            onError={() => setError('预览失败，请打开原件查看')}
          />}
          <a href={url} target="_blank" rel="noreferrer">
            打开原件
          </a>
        </>
      ) : (
        <HohoButton
          variant="secondary"
          loading={loading}
          onClick={() => void load()}
        >
          {error ? '重试读取附件' : '读取附件原件'}
        </HohoButton>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
function ExportSheet({
  report,
  onClose,
  token,
  memberId,
  onRefresh,
}: {
  report: VisitSheet
  onClose: () => void
  token: string
  memberId: string
  onRefresh:()=>Promise<boolean>
}) {
  const [notice, setNotice] = useState(''),
    [fallback, setFallback] = useState(false)
  const [selected,setSelected]=useState(report.selectedPhotoIds??[]),[running,setRunning]=useState(false)
  const [copyMode,setCopyMode]=useState<'brief'|'full'>('brief'),[includeHistory,setIncludeHistory]=useState(false),[needsUpdate,setNeedsUpdate]=useState(false)
  const makePrompt=(mode:'brief'|'full',history:boolean)=>`${consultationPrompt(report,{includeSources:false})}\n\n以下是已保存资料的整理内容，尚需核对，家长补充不是医疗结论：\n${mode==='brief'?doctorBriefText(report):reportText(report,history)}`
  const [promptText,setPromptText]=useState(()=>makePrompt('brief',false))
  useEffect(()=>{setPromptText(makePrompt(copyMode,includeHistory));setSelected(report.selectedPhotoIds??[]);setNeedsUpdate(false)},[report.version])
  const controller=useRef(new AbortController()),lock=useRef(false)
  useEffect(()=>{const current=new AbortController();controller.current=current;return()=>current.abort()},[])
  const validate=async()=>{
    const current=await visitSheetService.get(memberId,token,controller.current.signal)
    if(!current.report||current.stale||current.report.version!==report.version){setNeedsUpdate(true);throw new Error('资料或版本已变化。请在此更新后核对范围，再导出；本次未生成文件。')}
  }
  const resources=async()=>{
    await validate()
    const result:ExportResources={images:{},omitted:[]}
    for(const id of selected){
      const source=report.sources.find(s=>s.id===id)!
      try{const blob=await readPhoto(source,token,controller.current.signal);if(blob.size>20*1024*1024)throw new Error('原件超过单图 20 MB 离线容量');result.images[id]=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob)})}
      catch(e){if(controller.current.signal.aborted)throw e;result.omitted.push(`${source.title}：${e instanceof Error?e.message:'原图未附'}`)}
    }
    await validate()
    return result
  }
  const run=async(task:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setRunning(true);try{await task()}catch(e){if(!controller.current.signal.aborted)setNotice(e instanceof Error&&!/abort|fetch|timeout|timed out/i.test(e.message)?e.message:'输出读取超时或连接中断，未生成新文件，请重试')}finally{lock.current=false;if(!controller.current.signal.aborted)setRunning(false)}}
  const copy = async () => {
    await validate()
    try {
      await navigator.clipboard.writeText(promptText)
      setNotice(`已复制${copyMode==='brief'?'本次重点':'完整资料'}（约 ${promptText.length} 字符）；内容仍需核对`)
    } catch {
      setFallback(true)
      setNotice('浏览器未允许复制，请全选下方全文手动复制')
    }
  }
  return (
    <BottomSheetSurface
      open
      label="导出情况单"
      title="导出当前版本"
      onClose={()=>{controller.current.abort();onClose()}}
    >
      <div className="visit-export-options">
        <p>
          {report.member.name} · v{report.version} · 全部九章与完整依据
        </p>
        <p className="visit-muted">{report.scope} HTML 与打印为九章完整报告，含选中且成功内嵌的影像；非图片附件只含索引。重点摘要与复制文本不含照片字节；默认只复制本次重点，完整资料需单独选择。</p>
        {needsUpdate&&<HohoButton variant="secondary" disabled={running} onClick={()=>void run(async()=>{if(await onRefresh())setNotice('已更新到当前资料，请核对新的照片和文字范围后导出');else setNotice('更新未成功，旧报告保留；尚未导出新文件')})}>在此更新情况单</HohoButton>}
        <details><summary>核对导出照片 · 已选 {selected.length} 张</summary><p>与页面展示选择独立。未选图片字节不会写入文件。</p>{report.photos?.map(p=><label key={p.sourceId}><input type="checkbox" disabled={running} checked={selected.includes(p.sourceId)} onChange={e=>setSelected(e.target.checked?[...selected,p.sourceId]:selected.filter(id=>id!==p.sourceId))}/>{p.title} · {p.location} · {p.timeKind} {reportTime(p.capturedAt||p.uploadedAt)}</label>)}{!report.photos?.length&&<p>暂无可嵌入的关联附件照片。</p>}</details>
        <HohoButton
          loading={running}
          onClick={() => void run(async()=>{const result=await resources();if(controller.current.signal.aborted)return;downloadReport(report,result);setNotice(`已发起下载，请在浏览器下载列表查看。内嵌 ${Object.keys(result.images).length} 张影像。${result.omitted.length?'原图未附：'+result.omitted.join('；'):''}`)})}
        >
          保存完整离线报告（HTML）
        </HohoButton>
        <HohoButton variant="secondary" disabled={running} onClick={()=>void run(async()=>{await validate();downloadContent(doctorBriefText(report),'Hoooho-就诊重点摘要.txt','text/plain;charset=utf-8');setNotice('已发起重点摘要下载，不含完整原文或照片；请在浏览器下载列表查看')})}>保存重点摘要（文本）</HohoButton>
        <fieldset disabled={running}><legend>复制给 AI 的文字范围</legend><label><input type="radio" name="copy-scope" checked={copyMode==='brief'} onChange={()=>{setCopyMode('brief');setPromptText(makePrompt('brief',false))}}/>本次重点（默认）</label><label><input type="radio" name="copy-scope" checked={copyMode==='full'} onChange={()=>{setCopyMode('full');setPromptText(makePrompt('full',includeHistory))}}/>当前范围的完整资料</label>{copyMode==='full'&&<label><input type="checkbox" checked={includeHistory} onChange={e=>{setIncludeHistory(e.target.checked);setPromptText(makePrompt('full',e.target.checked))}}/>额外包含旧版情况单与编辑日志</label>}<p>约 {promptText.length} 字符 · 不含照片字节{copyMode==='brief'?'、无关旧问题、旧报告和修订日志':includeHistory?'；包含历史文本':'；不包含旧报告和修订日志'}。复制前可在下方编辑核对。</p></fieldset>
        <HohoButton variant="secondary" disabled={running} onClick={() => void run(copy)}>
          复制给 AI
        </HohoButton>
        <details><summary>核对 / 编辑问诊提示词</summary><textarea aria-label="问诊提示词" value={promptText} maxLength={60000} onChange={e=>setPromptText(e.target.value)}/><small>只编辑对外复制内容，不覆盖原始健康资料。</small></details>
        <HohoButton
          variant="secondary"
          disabled={running}
          onClick={() => void run(async()=>{const result=await resources();if(controller.current.signal.aborted)return;printReport(report,result);setNotice(`已准备完整打印报告，可在浏览器保存 PDF。${result.omitted.length?'原图未附：'+result.omitted.join('；'):''}`)})}
        >
          打印 / 另存 PDF
        </HohoButton>
        {notice && <p role="status">{notice}</p>}
        {fallback && (
          <label>
            可复制的当前范围文本
            <textarea
              readOnly
              value={promptText}
              onFocus={(e) => e.target.select()}
            />
          </label>
        )}
      </div>
    </BottomSheetSurface>
  )
}
