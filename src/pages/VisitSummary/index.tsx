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
import { ReportChapter, reportTime, SourceText } from './ReportChapter'
import { downloadReport, printReport, reportText, summaryText, downloadContent, type ExportResources } from './reportExport'
import { ReportPhotos, PhotoPicker, PhotoViewer, readPhoto } from './ReportPhotos'
import './report.css'
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
    [error, setError] = useState('')
  const [active, setActive] = useState<VisitChapterId>('overview'),
    [menu, setMenu] = useState(false),
    [editing, setEditing] = useState<'focus' | 'note' | null>(null),
    [exporting, setExporting] = useState(false)
  const [evidence, setEvidence] = useState<string[] | null>(null),
    [sourceEdit, setSourceEdit] = useState<VisitSource | null>(null),
    [search, setSearch] = useState(''),
    [notice, setNotice] = useState('')
  const [photoPicker,setPhotoPicker]=useState(false),[photoId,setPhotoId]=useState<string|null>(null),[editChapter,setEditChapter]=useState<VisitChapterId>('overview')
  const parentEvidence=useRef<string[]|null>(null)
  const modalTrigger=useRef<HTMLElement|null>(null)
  const scroll = useRef<HTMLDivElement>(null),
    version = useRef(0)
  const report = state?.report ?? null
  const modalOpen = !!(menu || editing || exporting || evidence || sourceEdit || photoPicker || photoId)
  useEffect(()=>{document.body.classList.add('visit-report-active');return()=>document.body.classList.remove('visit-report-active')},[])
  useEffect(()=>{if(modalOpen&&!modalTrigger.current)modalTrigger.current=document.activeElement as HTMLElement;if(scroll.current){scroll.current.inert=modalOpen;scroll.current.style.overflowY=modalOpen?'hidden':'auto'}if(!modalOpen&&modalTrigger.current)requestAnimationFrame(()=>modalTrigger.current?.focus({preventScroll:true}))},[modalOpen])
  const accept = (result: VisitSheetState) => {
    if (!alive.current) return
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
      if (eventId) {
        const event = await healthEventService.getById(eventId, token, c.signal)
        if (event.memberId !== memberId)
          throw new Error(
            '记录与当前孩子不一致，请从当前孩子的情况单入口重新打开',
          )
      }
      const result = await visitSheetService.get(memberId, token, c.signal)
      if (c.signal.aborted) return
      version.current = result.report?.version ?? result.expectedVersion ?? 0
      if (result.report) accept(result)
      else {
        const generated = await visitSheetService.save(
          memberId,
          token,
          { expectedVersion: version.current, requestId: crypto.randomUUID() },
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
            reason instanceof Error
              ? reason.message
              : '首次整理没有完成，请重试',
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
    setError('')
    try {
      const result = await visitSheetService.save(
        memberId,
        token,
        {
          ...changes,
          expectedVersion: version.current,
          requestId: crypto.randomUUID(),
        },
        controller.current?.signal,
      )
      if (!alive.current) return false
      accept(result)
      setNotice('情况单已更新')
      return true
    } catch (reason) {
      if (alive.current) {
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
          `${reason instanceof Error ? reason.message : '更新失败'}。这次更新没有完成，原报告仍保留。`,
        )
      }
      return false
    } finally {
      busy.current = false
      if (alive.current) setWorking(false)
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
              ) : undefined
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
                    ? ` · 出生 ${report.member.birthday}`
                    : ''}
                </p>
              </div>
            </div>
            <p className="visit-report-meta">
              资料截至 {reportTime(report.dataAsOf, report.timezone)} · v
              {report.version}
            </p>
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
            {!sources.length && <section className="visit-report-state"><h2>病情数据</h2><p>当前孩子尚无已保存资料。</p><HohoButton onClick={()=>navigate('/health-events')}>补充健康记录</HohoButton></section>}
            {!!sources.length && report.chapters.map(chapter=><ReportChapter key={chapter.id} chapter={chapter} report={report} onEvidence={openEvidence} action={chapter.id==='overview'?<button onClick={()=>{setError('');setEditing('focus')}}>更改主诉</button>:undefined} leading={chapter.id==='overview'? <>
              <section className="visit-report-focus">
                <h1>{report.complaint}</h1>
                <p className="visit-focus-meta">{report.focus.mode==='custom'?'家长本次陈述':`${report.candidates.find(c=>c.sourceId===report.complaintSourceId)?.timeKind || '记录时间'} ${reportTime(report.candidates.find(c=>c.sourceId===report.complaintSourceId)?.at??null)}`}</p>
              </section>
              <ReportPhotos report={report} token={token} onChoose={()=>setPhotoPicker(true)} onOpen={setPhotoId}/>
              </>:undefined} trailing={<>
            {chapter.id==='overview'&&<details className="visit-fact-block"><summary>集中核对资料缺口</summary>{report.gaps?.map(g=><p key={g}>{g}</p>)}</details>}
            {chapter.id === 'sources' && (
              <>
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
                {[...new Set(sources.map(s=>s.category))].map(category=><section className="visit-source-group" key={category}>
                <h3>{{record:'健康记录',course:'症状与病程记录',temperature:'体温记录',allergy:'过敏与观察记录',history:'既往记录',visits:'就诊检查记录',attachment:'附件原件索引',profile:'健康档案',fact:'结构化健康事实',growth:'成长测量',medication:'用药与执行记录','medication-plan':'用药计划','observation-plan':'观察计划',observation:'观察结果',birth:'出生史',chronic:'长期问题',surgery:'手术史','family-history':'家族史',feeding:'喂养记录',examination:'检查档案',hospitalization:'住院史',vaccination:'接种史',legacy:'旧版情况单'}[category]||'其他档案资料'} · {sources.filter(s=>s.category===category).length} 项资料</h3>
                <p className="visit-muted">资料项数不等于症状次数、服药次数或病情程度。</p>
                {sources.filter(s=>s.category===category)
                  .filter((s) =>
                    [s.title, s.text, s.occurredAt, s.id]
                      .join(' ')
                      .includes(search),
                  )
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
              </>
            )}
            <HohoButton
              variant="text"
              onClick={() => {
                setError('')
                setEditChapter(chapter.id)
                setEditing('note')
              }}
            >
              {chapter.id === 'overview'
                ? '编辑本次想问 / 补充报告说明'
                : `补充 / 校订 · ${chapter.title}`}
            </HohoButton>
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
      <BottomSheetSurface
        open={menu}
        label="章节目录"
        title="报告目录"
        onClose={() => setMenu(false)}
        className="visit-directory"
        layerClassName="visit-directory-layer"
      >
        <nav data-visit-sheet-index>
          {report?.chapters.map((c, i) => (
            <button
              key={c.id}
              aria-current={active === c.id ? 'page' : undefined}
              onClick={() => chooseChapter(c.id)}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              {c.title}
            </button>
          ))}
        </nav>
      </BottomSheetSurface>
      {report && editing && (
        <ReportEditor
          report={report}
          kind={editing}
          chapter={editChapter}
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
        <ExportSheet report={report} token={token} memberId={memberId} onClose={() => setExporting(false)} />
      )}
      {report&&photoPicker&&<PhotoPicker report={report} token={token} working={working} error={error} onClose={()=>setPhotoPicker(false)} onSave={async ids=>{const success=await update({selectedPhotoIds:ids});if(success)setPhotoPicker(false);return success}}/>}
      {report&&photoId&&<PhotoViewer report={report} token={token} id={photoId} onClose={()=>setPhotoId(null)}/>}
    </main>
  )
}

function ReportEditor({
  report,
  kind,
  chapter,
  working,
  error,
  onClose,
  onSave,
}: {
  report: VisitSheet
  kind: 'focus' | 'note'
  chapter: VisitChapterId
  working: boolean
  error: string
  onClose: () => void
  onSave: (changes: Partial<VisitSheetUpdate>) => Promise<boolean>
}) {
  const [focus, setFocus] = useState<VisitFocus>(report.focus),
    [custom, setCustom] = useState(report.focus.text ?? ''),
    [question, setQuestion] = useState(report.question),
    [note, setNote] = useState(report.notes[chapter] ?? ''),
    [confirmExit, setConfirmExit] = useState(false)
  const dirty =
    JSON.stringify(focus) !== JSON.stringify(report.focus) ||
    custom !== (report.focus.text ?? '') ||
    question !== report.question ||
    note !== (report.notes[chapter] ?? '')
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
      : { ...(chapter==='overview'&&question!==report.question ? { question } : {}), notes: { ...report.notes, [chapter]: note } }
  const valid = kind !== 'focus' || focus.mode !== 'custom' || !!custom.trim()
  return (
    <BottomSheetSurface
      open
      label={kind === 'focus' ? '更改主诉' : '补充报告说明'}
      title={kind === 'focus' ? '更改本次主诉' : '家长补充'}
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
            <label className="visit-focus-option">
              <input
                type="radio"
                name="focus"
                checked={focus.mode === 'auto'}
                onChange={() => setFocus({ mode: 'auto' })}
              />
              <span>
                <strong>按最近症状</strong>
                <small>后续更新随最近有效症状调整</small>
              </span>
            </label>
            {report.candidates.map((c) => (
              <label className="visit-focus-option" key={c.sourceId}>
                <input
                  type="radio"
                  name="focus"
                  checked={
                    focus.mode === 'source' && focus.sourceId === c.sourceId
                  }
                  onChange={() =>
                    setFocus({ mode: 'source', sourceId: c.sourceId })
                  }
                />
                <span>
                  <strong>{c.text}</strong>
                  <small>
                    {c.timeKind} · {reportTime(c.at, report.timezone)}
                  </small>
                </span>
              </label>
            ))}
            <label className="visit-focus-option">
              <input
                type="radio"
                name="focus"
                checked={focus.mode === 'custom'}
                onChange={() => setFocus({ mode: 'custom', text: custom })}
              />
              <strong>自己填写主诉</strong>
            </label>
            {focus.mode === 'custom' && (
              <label>
                本次主诉（家长陈述）
                <textarea
                  autoFocus
                  value={custom}
                  maxLength={1000}
                  onChange={(e) => setCustom(e.target.value)}
                />
              </label>
            )}
            <p className="visit-muted">
              调整报告焦点；原始资料保留。家长问题与补充会保留，请确认是否仍适用。
            </p>
          </>
        ) : (
          <>
            {chapter === 'overview' && (
              <label>
                本次想问
                <textarea
                  value={question}
                  maxLength={5000}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </label>
            )}
            <label>
              本章补充说明
              <textarea
                value={note}
                maxLength={5000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
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
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetch(
        source.contentPath && /^\/api\/members\/[^/]+\/visit-sheet\/resources\/[a-f0-9]{24}$/.test(source.contentPath) ? source.contentPath : `/api/events/${encodeURIComponent(source.eventId!)}/attachments/${encodeURIComponent(source.attachmentId!)}/content`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        },
      )
      if (!result.ok) throw new Error('附件读取失败，可重试')
      const blob=await result.blob()
      setImage(blob.type.startsWith('image/'))
      setUrl(URL.createObjectURL(blob))
    } catch {
      setError('附件读取失败，原件信息仍保留，请重试')
    } finally {
      setLoading(false)
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
}: {
  report: VisitSheet
  onClose: () => void
  token: string
  memberId: string
}) {
  const [notice, setNotice] = useState(''),
    [fallback, setFallback] = useState(false)
  const [selected,setSelected]=useState(report.selectedPhotoIds??[]),[running,setRunning]=useState(false)
  const controller=useRef(new AbortController()),lock=useRef(false)
  useEffect(()=>()=>controller.current.abort(),[])
  const validate=async()=>{
    const current=await visitSheetService.get(memberId,token,controller.current.signal)
    if(!current.report||current.stale||current.report.version!==report.version)throw new Error('资料或版本已变化，请先关闭并更新情况单，再核对导出范围')
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
  const run=async(task:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setRunning(true);try{await task()}catch(e){if(!controller.current.signal.aborted)setNotice(e instanceof Error?e.message:'输出未完成，请重试')}finally{lock.current=false;if(!controller.current.signal.aborted)setRunning(false)}}
  const copy = async () => {
    await validate()
    try {
      await navigator.clipboard.writeText(reportText(report))
      setNotice('已复制当前版本全文')
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
        <p className="visit-muted">{report.scope} HTML 与打印包含下方选中且成功内嵌的影像；其他附件只含索引。重点摘要不含全部原文，AI 文本包含摘要和全部原文，但都不含照片。</p>
        <details><summary>核对导出照片 · 已选 {selected.length} 张</summary><p>与页面展示选择独立。未选图片字节不会写入文件。</p>{report.photos?.map(p=><label key={p.sourceId}><input type="checkbox" disabled={running} checked={selected.includes(p.sourceId)} onChange={e=>setSelected(e.target.checked?[...selected,p.sourceId]:selected.filter(id=>id!==p.sourceId))}/>{p.title} · {p.location} · {p.timeKind} {reportTime(p.capturedAt||p.uploadedAt)}</label>)}{!report.photos?.length&&<p>暂无可嵌入的关联附件照片。</p>}</details>
        <HohoButton
          loading={running}
          onClick={() => void run(async()=>{const result=await resources();if(controller.current.signal.aborted)return;downloadReport(report,result);setNotice(`文件已准备好，内嵌 ${Object.keys(result.images).length} 张影像。${result.omitted.length?'原图未附：'+result.omitted.join('；'):''}`)})}
        >
          保存完整离线报告（HTML）
        </HohoButton>
        <HohoButton variant="secondary" disabled={running} onClick={()=>void run(async()=>{await validate();downloadContent(summaryText(report),'Hoooho-就诊重点摘要.txt','text/plain;charset=utf-8');setNotice('重点摘要已准备好，不含完整原文或照片')})}>保存重点摘要（文本）</HohoButton>
        <HohoButton variant="secondary" disabled={running} onClick={() => void run(copy)}>
          复制给 AI
        </HohoButton>
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
            可复制的完整情况单
            <textarea
              readOnly
              value={reportText(report)}
              onFocus={(e) => e.target.select()}
            />
          </label>
        )}
      </div>
    </BottomSheetSurface>
  )
}
