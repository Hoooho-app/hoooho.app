import { CompleteImage } from '../../components/common/CompleteImage'
import { ArrowLeft, Copy, Download, FileText, List } from 'lucide-react'
import { VisitReading, visibleReadingCards, type ReadingEditor } from './VisitReading'
import { VisitSubpage } from './VisitSubpage'
import { VisitUpdatePreview } from './VisitUpdatePreview'
import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
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
import { ReportChapter, reportTime, SourceText } from './ReportChapter'
import { consultationHtml, doctorBriefText, downloadContent, type ExportResources } from './reportExport'
import { PhotoPicker, PhotoViewer, readPhoto } from './ReportPhotos'
import './report.css'
import './reading.css'
import { ReportDirectory } from './ReportDirectory'
import { AIResultPreview, type AIUnverifiedPreview } from '../../features/ai-business/AIResultPreview'
import { preliminarySummaryExport } from './preliminarySummaryExport'
import { consultationPrompt } from '../../features/ai-business/consultationPrompt'
import { ReportScopeSheet } from '../../features/case-continuity/ReportScopeSheet'
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
    [editing, setEditing] = useState<ReadingEditor | null>(null),
    [exporting, setExporting] = useState(false)
  const [editorDirty,setEditorDirty]=useState(false),[medicationOpen,setMedicationOpen]=useState(false)
  const blocker=useBlocker(!!editing&&(editorDirty||working))
  const blockerRef=useRef(blocker)
  blockerRef.current=blocker
  const [evidence, setEvidence] = useState<string[] | null>(null),
    [sourceEdit, setSourceEdit] = useState<VisitSource | null>(null),
    [notice, setNotice] = useState('')
  const [opened,setOpened]=useState<{id:VisitChapterId;serial:number}>({id:'overview',serial:0})
  const [updateOpen,setUpdateOpen]=useState(false),[updateDraft,setUpdateDraft]=useState<VisitSheetState['updateCandidate']>(),[useAI,setUseAI]=useState(false)
  const [photoPicker,setPhotoPicker]=useState(false),[photoId,setPhotoId]=useState<string|null>(null)
  const parentEvidence=useRef<string[]|null>(null)
  const [scopeOpen,setScopeOpen] = useState(false)
  const [scopeUndo,setScopeUndo] = useState<{selection:VisitSheetUpdate['selection']}|null>(null)
  const pendingSave=useRef<{key:string;requestId:string}|null>(null)
  const [aiPreview,setAIPreview]=useState<AIUnverifiedPreview|null>(null),[previewText,setPreviewText]=useState('')
  const modalTrigger=useRef<HTMLElement|null>(null)
  const scroll = useRef<HTMLDivElement>(null),
    version = useRef(0)
  const report = state?.report ?? null
  const modalOpen = !!(menu || editing || exporting || evidence || sourceEdit || photoPicker || photoId || scopeOpen || updateOpen || medicationOpen)
  useEffect(()=>{document.body.classList.add('visit-report-active');return()=>document.body.classList.remove('visit-report-active')},[])
  useEffect(()=>{if(modalOpen&&!modalTrigger.current)modalTrigger.current=document.activeElement as HTMLElement;if(scroll.current){scroll.current.inert=modalOpen;scroll.current.style.overflowY=modalOpen?'hidden':'auto'}if(!modalOpen&&modalTrigger.current)requestAnimationFrame(()=>modalTrigger.current?.focus({preventScroll:true}))},[modalOpen])
  const accept = (result: VisitSheetState) => {
    if (!alive.current) return
    setAIPreview(null);setPreviewText('');setUpdateDraft(undefined)
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
      if (result.report) accept(result)
      if (result.report && !result.stale && (!caseFocus || result.report.focus.caseEventId === eventId)) accept(result)
      else {
        const generated = await visitSheetService.save(
          memberId,
          token,
          { expectedVersion: version.current, requestId: crypto.randomUUID(), ...(caseFocus ? { focus: caseFocus, selection:null } : {}) },
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
          ...(changes.generateAI&&!changes.previewUpdate?{previewAI:true}:{}),
          expectedVersion: version.current,
          requestId: pendingSave.current.requestId,
        },
        controller.current?.signal,
      )
      if (!alive.current) return false
      if(result.updateCandidate){setAIPreview(null);setPreviewText('');setUpdateDraft(result.updateCandidate);pendingSave.current=null;setNotice('草稿已返回，确认后才替换当前情况单');return true}
      accept(result)
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
    setOpened(previous=>({id,serial:previous.serial+1}))
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
        <span aria-hidden="true" className="visit-header-spacer"/>
      </header>
      <div className="visit-reading-toolbar">
        <button
          aria-label="章节目录"
          disabled={!report}
          onClick={() => setMenu(true)}
        >
          <List size={21} />
          目录
        </button>
        <button
          aria-label="导出情况单"
          disabled={!report||loading||working}
          onClick={() => setExporting(true)}
        >
          <Download size={20} />
          导出
        </button>
      </div>
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
              <HohoButton disabled={loading||working} onClick={() => void load()}>重试</HohoButton>
            }
          >
            {error}
          </StatusNotice>
        )}
        {report && (
          <>
            {[...new Set([...(state?.warnings??[]),...report.warnings])].map(w=><StatusNotice title={w} tone="warning" key={w}/>)}
            <VisitReading report={report} token={token} busy={loading||working} onEvidence={openEvidence} onEdit={kind=>{setEditorDirty(false);setEditing(kind)}} onMedia={setPhotoId} onChoose={()=>setPhotoPicker(true)} onMedications={()=>setMedicationOpen(true)} opened={opened}/>
          </>
        )}
        {notice && (
          <p role="status" className="visit-muted">
            {notice}
          </p>
        )}
      </div>
      {menu&&report&&<ReportDirectory chapters={visibleReadingCards(report).map(card=>({...card,summary:'',blocks:[]}))} active={active} onClose={()=>setMenu(false)} onChoose={chooseChapter}/>}
      {report && scopeOpen && <ReportScopeSheet initial={report.selection} memberId={memberId} token={token} version={report.version} busy={working} error={error} onClose={()=>{if(!working)setScopeOpen(false)}} onSave={async selection=>{const previous=report.selection??null;if(await update({selection})){setScopeUndo({selection:previous});setScopeOpen(false)}}} onUndo={scopeUndo?async()=>{if(await update({selection:scopeUndo.selection})){setScopeUndo(null);setScopeOpen(false)}}:undefined}/>}
      {report && editing && (
        <ReportEditor
          report={report}
          kind={editing}
          onDirty={setEditorDirty}
          navigationBlocked={blocker.state==='blocked'}
          onKeepEditing={()=>{if(blocker.state==='blocked')blocker.reset()}}
          working={working}
          error={error}
          onScope={()=>{setEditing(null);setScopeOpen(true)}}
          onPhotos={()=>{setEditing(null);setPhotoPicker(true)}}
          onClose={() => {setEditing(null);setEditorDirty(false);if(blockerRef.current.state==='blocked')blockerRef.current.proceed()}}
          onSave={async (changes) => {
            const success = await update(changes)
            if (success) {
              setEditing(null)
              setEditorDirty(false)
              if(blockerRef.current.state==='blocked')blockerRef.current.proceed()
              if (changes.focus) {
                chooseChapter('overview')
              }
              else chooseChapter(editing==='question'?'medication':editing==='course'?'course':editing==='data'?'sources':'overview')
            }
            return success
          }}
        />
      )}
      {report&&medicationOpen&&<VisitSubpage label="用药资料" title="用药资料" suspended={!!(evidence||sourceEdit||updateOpen)} onClose={()=>setMedicationOpen(false)}><ReportChapter report={report} chapter={{...report.chapters.find(chapter=>chapter.id==='medication')!,title:''}} expanded onEvidence={openEvidence}/></VisitSubpage>}
      {report&&updateOpen&&<VisitSubpage label="更新情况单" title="更新情况单" onClose={()=>{if(!working)setUpdateOpen(false)}}>
        {!updateDraft&&<><p>先核对主诉、资料范围和待补充信息；整理结果确认后才替换当前情况单。</p>
        <h3>本次主诉</h3><p>{report.complaint}</p><h3>资料范围</h3><p>{report.scope}</p><h3>仍待补充</h3>{(report.gaps??[]).map(gap=><p key={gap}>{gap}</p>)}</>}
        {!updateDraft&&<label className="visit-focus-option"><input type="checkbox" checked={useAI} disabled={working} onChange={e=>setUseAI(e.target.checked)}/>使用现有 AI 摘要能力进一步整理（将调用当前模型）</label>}
        {!updateDraft?<HohoButton loading={working} onClick={()=>void update({previewUpdate:true,...(useAI?{generateAI:true}:{})})}>{aiWorking?'正在整理草稿':'整理并查看草稿'}</HohoButton>:<section aria-label="更新草稿"><VisitUpdatePreview current={report} candidate={updateDraft.report}/><p>手动补充、已确认问题和影像选择保留。原情况单尚未改变。</p><HohoButton loading={working} onClick={()=>void update({confirmUpdate:updateDraft.id}).then(ok=>{if(ok){setUpdateDraft(undefined);setUpdateOpen(false)}})}>确认替换情况单</HohoButton><HohoButton variant="text" disabled={working} onClick={()=>setUpdateDraft(undefined)}>不采用，重新整理</HohoButton></section>}
        {error&&<p role="alert">{error}</p>}
        {aiPreview&&<AIResultPreview preview={aiPreview} value={previewText} onChange={setPreviewText} compactDiagnostics><p>这份内容未通过事实核对，不会写入正式情况单。以下仅导出带有“非已确认报告”标识的核对材料，不是当前情况单。</p><HohoButton variant="secondary" onClick={()=>downloadContent(preliminarySummaryExport(previewText,aiPreview,'text'),'Hoooho-待核对摘要.txt','text/plain;charset=utf-8')}>导出待核对摘要（文本）</HohoButton><HohoButton variant="secondary" onClick={()=>downloadContent(preliminarySummaryExport(previewText,aiPreview,'html'),'Hoooho-待核对摘要.html','text/html;charset=utf-8')}>导出待核对摘要（离线HTML）</HohoButton></AIResultPreview>}
      </VisitSubpage>}
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
            parentEvidence.current=null
            setSourceEdit(null);setEvidence(null);void load()
          }}
        />
      )}
      {report && exporting && (
        <ExportSheet report={report} token={token} memberId={memberId} onRefresh={async()=>{setExporting(false);await load();setNotice("资料或版本已变化，已重新读取。请核对当前情况单后重新导出。")}} onClose={() => setExporting(false)} />
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
  onScope,
  onPhotos,
  onDirty,
  navigationBlocked,
  onKeepEditing,
}: {
  report: VisitSheet
  kind: ReadingEditor
  working: boolean
  error: string
  onClose: () => void
  onSave: (changes: Partial<VisitSheetUpdate>) => Promise<boolean>
  onScope:()=>void
  onPhotos:()=>void
  onDirty:(dirty:boolean)=>void
  navigationBlocked:boolean
  onKeepEditing:()=>void
}) {
  const [focus, setFocus] = useState<VisitFocus>(report.focus),
    [custom, setCustom] = useState(report.focus.text ?? ''),
    [question, setQuestion] = useState(report.question),
    [query, setQuery] = useState(''),
    [confirmExit, setConfirmExit] = useState(false)
  const [caseDetails,setCaseDetails]=useState(report.caseDetails??{}),[notes,setNotes]=useState(report.notes)
  const exitPrompt=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(confirmExit||navigationBlocked){exitPrompt.current?.focus({preventScroll:true});exitPrompt.current?.scrollIntoView({block:'center'})}},[confirmExit,navigationBlocked])
  const dirty =
    JSON.stringify(focus) !== JSON.stringify(report.focus) ||
    custom !== (report.focus.text ?? '') ||
    question !== report.question || JSON.stringify(caseDetails)!==JSON.stringify(report.caseDetails??{}) || JSON.stringify(notes)!==JSON.stringify(report.notes)
  useEffect(()=>onDirty(dirty),[dirty,onDirty])
  useEffect(()=>{
    const guard=(event:BeforeUnloadEvent)=>{if(dirty||working){event.preventDefault();event.returnValue=''}}
    window.addEventListener('beforeunload',guard)
    return()=>window.removeEventListener('beforeunload',guard)
  },[dirty,working])
  const close = () => {
    if (working) return
    if (dirty) setConfirmExit(true)
    else onClose()
  }
  const changes =
    (kind === 'focus'||kind==='association')
      ? {
          focus:
            focus.mode === 'custom'
              ? { ...focus, mode: 'custom' as const, text: custom.trim() }
              : focus,
        }
      : kind==='question'?{ question }:kind==='current'?{caseDetails}:{notes}
  const valid = (kind !== 'focus'&&kind!=='association') || focus.mode !== 'custom' || !!custom.trim()
  // Group exact equivalent labels only; never merge different symptoms by guesswork.
  const groups=[...new Set(report.candidates.map(c=>c.text.trim()))].map(text=>report.candidates.filter(c=>c.text.trim()===text))
  return (
    <VisitSubpage
      label={{association:'选择相关记录',focus:'更改主诉',question:'编辑本次想问',current:'编辑目前情况',course:'编辑相关经过与处理',data:'编辑完整资料档案'}[kind]}
      title={{association:'选择相关记录',focus:'更改主诉',question:'编辑本次想问',current:'编辑目前情况',course:'编辑相关经过与处理',data:'编辑完整资料档案'}[kind]}
      onClose={close}

    >
      <div className="visit-report-editor">
        <fieldset className="visit-editor-fields" disabled={working}>
        {(kind === 'focus'||kind==='association') ? (
          <>
            {kind==='association'?<><h3>{report.complaint}</h3><p>选择你确认与本次主诉相关的已有症状记录。</p></>:<><label className="visit-focus-option"><input type="radio" name="focus" checked={focus.mode==='custom'} onChange={()=>setFocus(previous=>({...previous,mode:'custom',text:custom}))}/><strong>自己描述</strong></label>
            <label>本次主诉<textarea value={custom} maxLength={1000} placeholder="用自己的话描述这次想了解的问题" onChange={e=>{setCustom(e.target.value);setFocus(previous=>({...previous,mode:'custom',text:e.target.value}))}}/></label></>}
            {kind==='association'&&<fieldset><legend>确认与本次主诉相关的已有记录</legend><p>名称不必相同；仅纳入你明确选择的症状及其已有处理关联。</p>{!report.candidates.length&&<p>暂无可选择的症状记录。可先补充本次情况，记录症状后再关联。</p>}{report.candidates.map(candidate=><label className="visit-focus-option" key={candidate.sourceId}><input type="checkbox" checked={focus.relatedSourceIds?.includes(candidate.sourceId)??false} onChange={e=>setFocus(previous=>({...previous,relatedSourceIds:e.target.checked?[...(previous.relatedSourceIds??[]),candidate.sourceId]:(previous.relatedSourceIds??[]).filter(id=>id!==candidate.sourceId)}))}/><span>{candidate.text}<small>{reportTime(candidate.at,report.timezone)}</small></span></label>)}</fieldset>}
            {kind==='focus'&&<><label className="visit-focus-option">
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
            </p></>}
          </>
        ) : kind==='question' ? (
          <>
              <label>
                本次想问
                <textarea
                  aria-label="本次想问"
                  rows={7}
                  value={question}
                  maxLength={5000}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </label>
              <div className="visit-question-suggestions" aria-label="可选问题">{(report.reading?.questionCandidates??[]).slice(3,10).map(template=><button type="button" aria-label={`添加问题：${template}`} key={template} disabled={question.split('\n').some(line=>line.trim()===template)} onClick={()=>setQuestion(previous=>previous.trim()?`${previous.trimEnd()}\n${template}`:template)}>{template}</button>)}</div>
          </>
        ) : kind==='current'?<>{(['description','onset','change','other'] as const).map(key=><label key={key}>{{description:'目前情况',onset:'实际开始时间',change:'最近变化',other:'其他表现'}[key]}<textarea maxLength={5000} value={caseDetails[key]??''} placeholder={report.reading?.[key]??'未填写'} onChange={e=>setCaseDetails(previous=>({...previous,[key]:e.target.value}))}/></label>)}<p>补充只保存到情况单；不覆盖原始记录。不确定的内容请保持未知。</p></>:kind==='course'?<label>相关经过与处理补充（已发生的情况）<textarea aria-label="相关经过与处理补充（已发生的情况）" maxLength={5000} value={notes.course??''} onChange={e=>setNotes(previous=>({...previous,course:e.target.value}))}/><small>原始经过保持来源可追溯；此处仅保存家长补充，不改写原记录。</small></label>:<>{(['history','allergy','sources'] as const).map(key=><label key={key}>{{history:'既往背景补充',allergy:'过敏资料补充（不是确诊）',sources:'资料说明'}[key]}<textarea maxLength={5000} value={notes[key]??''} onChange={e=>setNotes(previous=>({...previous,[key]:e.target.value}))}/></label>)}<HohoButton variant="secondary" disabled={dirty||working} onClick={onScope}>调整 / 恢复资料范围</HohoButton><HohoButton variant="secondary" disabled={dirty||working} onClick={onPhotos}>添加 / 调整影像</HohoButton><p>原始记录与全局健康档案不在这里覆盖。</p></>}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="visit-editor-bottom"><HohoButton variant="secondary" disabled={working} onClick={close}>取消</HohoButton><HohoButton disabled={!valid} loading={working} onClick={()=>void onSave(changes)}>保存</HohoButton></div>
        {(confirmExit || navigationBlocked) && (
          <div ref={exitPrompt} tabIndex={-1} role="alert">
            <p>还有未保存的内容</p>
            <HohoButton
              disabled={!valid}
              loading={working}
              onClick={() => void onSave(changes)}
            >
              保存
            </HohoButton>
            <HohoButton variant="secondary" disabled={working} onClick={onClose}>
              放弃修改
            </HohoButton>
            <HohoButton variant="text" disabled={working} onClick={() => {setConfirmExit(false);onKeepEditing()}}>
              继续编辑
            </HohoButton>
          </div>
        )}
      </div>
    </VisitSubpage>
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
          {image && <CompleteImage
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
function ExportSheet({ report, onClose, token, memberId, onRefresh }: {
  report: VisitSheet
  onClose: () => void
  token: string
  memberId: string
  onRefresh: () => Promise<void>
}) {
  const [notice, setNotice] = useState('')
  const [fallback, setFallback] = useState<{label:string;text:string}|null>(null)
  const [running, setRunning] = useState<'prompt'|'html'|'text'|null>(null)
  const controller = useRef(new AbortController()), lock = useRef(false)
  useEffect(() => {
    const current = new AbortController()
    controller.current = current
    return () => current.abort()
  }, [])
  const validate = async () => {
    const current = await visitSheetService.get(memberId, token, controller.current.signal)
    if (controller.current.signal.aborted) throw new DOMException('已取消', 'AbortError')
    if (!current.report || current.stale || current.report.version !== report.version) {
      // Refresh in the reading view; never finish exporting the old snapshot.
      await onRefresh()
      throw new Error('资料或版本已变化，请核对更新后的情况单再导出。')
    }
  }
  const resources = async () => {
    await validate()
    const result: ExportResources = {images:{}, omitted:[]}
    let total = 0
    const failed: string[] = []
    for (const id of report.selectedPhotoIds ?? []) {
      const source = report.sources.find(s => s.id === id)
      if (!source) throw new Error('所选影像资料已变化，请关闭面板并更新情况单后重试。')
      try {
        const blob = await readPhoto(source, token, controller.current.signal)
        if (total + blob.size > 80 * 1024 * 1024) throw new Error('原件合计超过 80 MB，请在情况单中调整影像选择后重试')
        total += blob.size
        result.images[id] = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('原件读取失败'))
          reader.readAsDataURL(blob)
        })
      } catch (e) {
        if (controller.current.signal.aborted) throw e
        failed.push(`${source.title}：${e instanceof Error ? e.message : '原件读取失败'}`)
      }
    }
    await validate()
    if (failed.length) throw new Error(`未生成文件，所选原件未能完整附带：${failed.join('；')}。请重试，或在情况单中调整影像选择。`)
    return result
  }
  const run = async (action: 'prompt'|'html'|'text', task: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true
    setRunning(action)
    setNotice('')
    setFallback(null)
    try { await task() }
    catch (e) {
      if (!controller.current.signal.aborted) setNotice(e instanceof Error && !/abort|fetch|timeout|timed out/i.test(e.message) ? e.message : '读取超时或连接中断，请重试')
    } finally {
      lock.current = false
      if (!controller.current.signal.aborted) setRunning(null)
    }
  }
  const copy = async (text: string, label: string) => {
    await validate()
    try {
      await navigator.clipboard.writeText(text)
      if (!controller.current.signal.aborted) setNotice(`已复制${label}`)
    } catch {
      if (controller.current.signal.aborted) return
      setFallback({label, text})
      setNotice('浏览器未允许复制，请全选下方文本手动复制')
    }
  }
  const plainText = doctorBriefText(report)
  const promptText = `${consultationPrompt(report,{includeSources:false})}\n\n以下是已保存资料的整理内容，尚需核对，家长补充不是医疗结论：\n${plainText}`
  return (
    <BottomSheetSurface open label="导出情况单" title="导出情况单" onClose={() => {controller.current.abort();onClose()}}>
      <div className="visit-export-options">
        <HohoButton fullWidth loading={running==='prompt'} disabled={!!running} onClick={() => void run('prompt', () => copy(promptText, '问诊提示词'))}>
          <Copy size={18} aria-hidden="true" />复制问诊提示词
        </HohoButton>
        <HohoButton fullWidth variant="secondary" loading={running==='html'} disabled={!!running} onClick={() => void run('html', async () => {
          const result = await resources()
          if (controller.current.signal.aborted) return
          downloadContent(consultationHtml(report,result,true), 'Hoooho-就诊情况单.html', 'text/html;charset=utf-8')
          setNotice(`已发起下载，请在浏览器下载列表查看。内嵌 ${Object.keys(result.images).length} 份影像原件。`)
        })}>
          <Download size={18} aria-hidden="true" />保存 HTML 情况单
        </HohoButton>
        <HohoButton fullWidth variant="text" loading={running==='text'} disabled={!!running} onClick={() => void run('text', () => copy(plainText, '纯文本'))}>
          <FileText size={18} aria-hidden="true" />复制纯文本
        </HohoButton>
        {notice && <p role="status">{notice}</p>}
        {fallback && <label>可复制的{fallback.label}<textarea readOnly value={fallback.text} onFocus={e => e.target.select()} /></label>}
      </div>
    </BottomSheetSurface>
  )
}
