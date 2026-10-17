import { ArrowLeft, Camera, Check, CheckCircle2, ChevronRight, CircleHelp, ClipboardPaste, FileText, FileUp, Files, FolderPlus, Hospital, Images, Link2, LoaderCircle, MessageSquareText, PencilLine, Plus, ScanText, Sparkles, Stethoscope, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { BottomSheetSurface, HealthCard, HealthTag, HohoButton, HohoInput, StatusNotice } from '../../components/design-system'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { useAppStore } from '../../store/useAppStore'
import { healthEventRecordService } from '../../services/healthEventRecords'
import type { HealthEventRecordApiDto } from '../../types'
import { localDateTimeValue } from '../../utils/healthOccurredAt'
import { useJournal } from '../../pages/HealthEvents/useJournal'
import { RecordOriginals } from '../ai-business/RecordOriginals'
import { ownRecordFormHistory } from '../body-location/childBodyHistory'
import { useVisitMaterials } from './useVisitMaterials'
import { visitMaterialSources, type LocalVisitDocument, type VisitMaterialBlock, type VisitMaterialSource } from './types'
import './visitMaterials.css'

const sourceIcon = { hospital: Hospital, online_doctor: Stethoscope, external_ai: Sparkles }
const statusText = { preparing: '正在准备原件', uploading: '正在上传原件', queued: '已接收，等待整理', recognizing: '正在识别文字', organizing: '正在整理要点', ready: '已整理，可核对', failed: '暂未识别，可以重试' }
type Sheet = 'help' | 'paste' | 'supplement' | 'meta' | 'recent' | 'related' | 'leave' | null
export function VisitMaterialsWorkspace({ memberId, token, initialRecord, onBack, onClose, onSaved, onDelete, onViewRecord }: {
  memberId: string; token: string; initialRecord?: HealthEventRecordApiDto; onBack: () => void; onClose: () => void; onSaved: (message: string) => void; onDelete?: (recordId: string) => Promise<void>; onViewRecord?: (eventId: string, recordId: string) => void
}) {
  const model = useVisitMaterials({ memberId, token, initialRecord, onSaved })
  const navigate = useNavigate()
  const member = useAppStore(store => store.members.find(item => item.id === memberId))
  const journal = useJournal(memberId, token, 0)
  const [sheet, setSheet] = useState<Sheet>(null), [text, setText] = useState(''), [edit, setEdit] = useState<VisitMaterialBlock | null>(null)
  const [original, setOriginal] = useState<{ document: LocalVisitDocument; quote?: string } | null>(null)
  const [cameraMode, setCameraMode] = useState(false)
  const [previous, setPrevious] = useState<HealthEventRecordApiDto[]>([])
  const album = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null), pdf = useRef<HTMLInputElement>(null), page = useRef<HTMLElement>(null)
  const exitAllowed = useRef(false), originalHistory = useRef(window.history.state), originalUrl = useRef(window.location.href)
  const processing = model.documents.some(document => !['ready', 'failed'].includes(document.status))
  const ready = model.documents.filter(document => document.status === 'ready').length
  const hasContent = model.documents.length > 0 || Boolean(model.supplement.trim())
  const locked = model.saving || model.saveLocked
  const SourceIcon = sourceIcon[model.source]
  const stageTitle = model.stage === 'review' ? '核对资料' : '就诊资料'
  const recent = journal.sourceEntries.filter(entry => entry.visit && !entry.visit.linkedVisitRecordId).slice(0, 6)
  const symptomEntries = journal.sourceEntries.filter(entry => entry.categories?.includes('symptom')).filter((entry, i, all) => all.findIndex(other => other.eventId === entry.eventId) === i).slice(0, 12)
  usePageScrollLock(true)
  useDialogFocus(!sheet && !original && !edit, page)
  useEffect(() => {
    if (!model.targetEventId || !model.targetRecordId) { setPrevious([]); return }
    const controller = new AbortController()
    void healthEventRecordService.list(model.targetEventId, token, controller.signal).then(records => {
      if (!controller.signal.aborted) setPrevious(records.filter(record => (record.id === model.targetRecordId || record.journal?.visit?.linkedVisitRecordId === model.targetRecordId) && record.id !== model.saved?.recordId))
    }).catch(() => { if (!controller.signal.aborted) model.setError('此前资料暂未加载，原记录仍保留，可稍后重试') })
    return () => controller.abort()
  }, [model.targetEventId, model.targetRecordId, model.saved?.recordId, token])
  const close = () => {
    if (model.saving) return
    if (model.stage === 'review' && !initialRecord) { model.setStage('processing'); return }
    if (model.stage === 'saved' || !hasContent) { onBack(); return }
    setSheet('leave')
  }
  const leave = () => { exitAllowed.current = true; setSheet(null); onBack() }
  useLayoutEffect(() => {
    originalHistory.current = window.history.state
    originalUrl.current = window.location.href
    const back = (event: PopStateEvent) => {
      if (exitAllowed.current) return false
      if (!sheet && !edit && !original && (model.stage === 'saved' || !hasContent)) return false
      window.history.pushState(originalHistory.current, '', originalUrl.current)
      if (original) setOriginal(null)
      else if (edit) setEdit(null)
      else if (sheet) setSheet(null)
      else if (model.stage === 'review' && !initialRecord) model.setStage('processing')
      else setSheet('leave')
      return true
    }
    return ownRecordFormHistory(back)
  }, [sheet, edit, original, hasContent, model.stage, initialRecord])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasContent && model.stage !== 'saved') { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [hasContent, model.stage])
  const openText = (name: 'paste' | 'supplement') => { setText(name === 'supplement' ? model.supplement : ''); setSheet(name) }
  const selectRecent = (entry: (typeof recent)[number]) => {
    model.chooseTarget(entry.eventId, entry.id, entry.visit?.materials?.title || entry.content.split('\n')[0], entry.timePrecision === 'unknown' || entry.caseContext?.timeUnknown ? undefined : entry.visit?.materials?.occurredAt || entry.occurredAt)
    setSheet(null)
  }
  const loadFiles = (files: FileList | null) => { if (files?.length) void model.addFiles(Array.from(files)) }
  const showOriginal = (document: LocalVisitDocument, quote?: string) => setOriginal({ document, quote })
  const thumbnail = (document: LocalVisitDocument, small = false) => <button aria-label={'查看原件：' + document.name} className={'vm-thumbnail' + (small ? ' vm-thumbnail--small' : '')} type="button" onClick={() => showOriginal(document)}>
    {document.preview ? <img alt="" src={document.preview} onError={event => { event.currentTarget.hidden = true }}/>: document.kind === 'link' ? <Link2 aria-hidden="true" size={24}/> : document.kind === 'text' ? <MessageSquareText aria-hidden="true" size={24}/> : <FileText aria-hidden="true" size={24}/>}
    {!small && <span>{document.name}</span>}
  </button>
  const renderBlock = (block: VisitMaterialBlock, editable = false) => <section className="vm-reading-section" key={block.id}>
    <div className="vm-section-heading"><h3>{block.title}</h3>{editable && <HohoButton variant="text" size="small" disabled={locked} onClick={() => setEdit({ ...block })}>编辑</HohoButton>}</div>
    <p className="vm-paragraph">{block.text}</p>
    <HohoButton variant="text" size="small" className="vm-source-link" onClick={() => { const document = model.documents.find(item => item.id === block.documentId); if (document) showOriginal(document, block.quote) }}><ScanText aria-hidden="true" size={14}/>对照原件{block.page > 1 ? ' · 第' + block.page + '页' : ''}<ChevronRight aria-hidden="true" size={13}/></HohoButton>
  </section>
  const importPanel = <HealthCard className="vm-import">
    <div className="vm-import-art">{model.source === 'hospital' ? <Files aria-hidden="true" size={40} strokeWidth={1.3}/> : <MessageSquareText aria-hidden="true" size={40} strokeWidth={1.3}/>}</div>
    <h2>{model.source === 'hospital' ? '把这次就诊的资料放进来' : '把问诊对话带回来'}</h2>
    <p>{model.source === 'hospital' ? '病历、报告、处方、医嘱和回执' : model.source === 'online_doctor' ? '医生回复、电子处方、聊天截图' : '截图或复制对话，保留提问和回答'}</p>
    <div className="vm-action-pair"><HohoButton variant="secondary" disabled={locked || !model.hydrated} onClick={() => { setCameraMode(true); camera.current?.click() }}><Camera aria-hidden="true" size={19}/>拍照</HohoButton><HohoButton disabled={locked || !model.hydrated} onClick={() => { setCameraMode(false); album.current?.click() }}><Images aria-hidden="true" size={19}/>{model.source === 'hospital' ? '从相册选择' : '上传截图'}</HohoButton></div>
    <div className="vm-action-pair vm-import-more"><HohoButton variant="text" disabled={locked} onClick={() => { setCameraMode(false); pdf.current?.click() }}><FileUp aria-hidden="true" size={18}/>导入 PDF</HohoButton><HohoButton variant="text" disabled={locked} onClick={() => openText('paste')}><ClipboardPaste aria-hidden="true" size={18}/>{model.source === 'hospital' ? '粘贴文字' : '粘贴对话'}</HohoButton></div>
  </HealthCard>
  const review = <>
    {model.stage === 'saved' && <div className="vm-saved" role="status"><CheckCircle2 size={20} aria-hidden="true"/>{model.targetRecordId && model.targetRecordId !== model.saved?.recordId ? '已补充到原就诊 · 健康日历' : '已保存到健康日历'}</div>}
    <div className="vm-between"><HealthTag tone="primary"><SourceIcon size={15} aria-hidden="true"/>{visitMaterialSources[model.source]}</HealthTag><span className="vm-secondary">{member?.name ? '保存给' + member.name : ''}</span></div>
    {model.source === 'external_ai' && <div className="vm-source-notice"><Sparkles size={16} aria-hidden="true"/><span>AI 参考，尚未经医生确认。</span></div>}
    <div className="vm-document-title">{model.title || (model.source === 'hospital' ? '医院就诊资料' : model.source === 'online_doctor' ? '在线问诊资料' : 'AI 问诊参考')}</div>
    <div className="vm-metadata"><span>{model.source === 'hospital' ? '就诊时间' : '问诊时间'}</span><span>{model.occurredAt ? new Date(model.occurredAt).toLocaleString('zh-CN', { hour12: false }) : '资料未注明'}</span>{model.stage === 'review' && <HohoButton size="small" variant="text" disabled={locked} onClick={() => setSheet('meta')}>编辑</HohoButton>}</div>
    <div className="vm-metadata"><span>{model.source === 'hospital' ? '就诊机构' : model.source === 'online_doctor' ? '问诊平台' : 'AI 来源'}</span><span>{model.institution || '待补充'}</span>{model.stage === 'review' && <HohoButton size="small" variant="text" disabled={locked} onClick={() => setSheet('meta')}>编辑</HohoButton>}</div>
    {model.stage === 'saved' && model.originalsOnly ? <StatusNotice title="原件已保存，尚未确认整理结果"/> : model.blocks.map(block => renderBlock(block, model.stage === 'review'))}
    {model.stage === 'review' && !model.blocks.length && <StatusNotice title="暂无可用整理内容，可对照原件补充"/>}
    {model.documents.some(document => document.status === 'failed') && <p className="vm-secondary">未识别清的资料将按原件保存。</p>}
    <section className="vm-reading-section"><div className="vm-section-heading"><h3>资料原件 <span className="vm-secondary">{model.documents.length}份</span></h3>{model.stage === 'review' && !model.saved && <HohoButton variant="text" size="small" disabled={locked} onClick={() => { model.setStage('processing'); album.current?.click() }}>继续添加</HohoButton>}</div><div className="vm-original-grid">{model.documents.map(document => <div key={document.id}>{thumbnail(document)}</div>)}</div></section>
    {previous.length > 0 && <section className="vm-reading-section"><h3>此前的就诊资料</h3>{previous.map(record => <div className="vm-prior-record" key={record.id}><p>{record.journal?.visit?.materials?.title || record.content}</p><RecordOriginals eventId={record.eventId} attachmentIds={record.caseContext?.attachmentIds ?? []} recordId={record.id}/></div>)}</section>}
    {!model.targetRecordId && <HohoButton variant="text" className="vm-full-row" disabled={locked} onClick={() => setSheet('related')}><Link2 aria-hidden="true" size={17}/>{model.targetEventId ? '已关联症状事件' : '关联症状事件'}<ChevronRight aria-hidden="true" size={16}/></HohoButton>}
    {model.supplement ? <section className="vm-reading-section"><div className="vm-section-heading"><h3>补充说明</h3>{model.stage === 'review' && <HohoButton variant="text" size="small" disabled={locked} onClick={() => openText('supplement')}>编辑</HohoButton>}</div><p className="vm-paragraph">{model.supplement}</p></section> : model.stage === 'review' && <HohoButton variant="text" className="vm-full-row" disabled={locked} onClick={() => openText('supplement')}><PencilLine aria-hidden="true" size={17}/>补充一句</HohoButton>}
  </>
  return <div className="medication-record-page-layer"><section ref={page} role="dialog" aria-modal="true" aria-label="就诊资料" className="medication-record-page visit-materials-page" tabIndex={-1}>
    <header className="vm-header"><button aria-label="返回" disabled={model.saving} onClick={close} type="button"><ArrowLeft size={22}/></button><h1>{stageTitle}</h1>{model.stage === 'saved' ? <button className="vm-header-action" onClick={onClose} type="button">完成</button> : <span/>}</header>
    <input hidden ref={album} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="上传照片或问诊截图" onChange={event => { loadFiles(event.currentTarget.files); event.currentTarget.value = '' }}/>
    <input hidden ref={camera} type="file" accept="image/*" capture="environment" aria-label="拍摄就诊资料" onChange={event => { setCameraMode(true); loadFiles(event.currentTarget.files); event.currentTarget.value = '' }}/>
    <input hidden ref={pdf} type="file" multiple accept="application/pdf" aria-label="导入就诊 PDF" onChange={event => { loadFiles(event.currentTarget.files); event.currentTarget.value = '' }}/>
    <main className="vm-main">
      {model.error && <StatusNotice tone="error" title={model.error}/>}
      {model.notice && <p className="vm-notice" role="status">{model.notice}</p>}
      {model.stage === 'entry' ? <>
        <div className="vm-source-heading"><span>资料来源</span><HohoButton size="small" variant="text" onClick={() => setSheet('help')}>怎么带回来<CircleHelp aria-hidden="true" size={15}/></HohoButton></div>
        <div className="vm-source-segment" role="group" aria-label="资料来源">{(Object.keys(visitMaterialSources) as VisitMaterialSource[]).map(value => <button disabled={locked} aria-pressed={model.source === value} key={value} type="button" onClick={() => model.setSource(value)}>{visitMaterialSources[value]}</button>)}</div>
        {model.draft && <HealthCard className="vm-draft"><HohoButton fullWidth variant="text" disabled={locked} onClick={() => void model.resumeDraft()}>继续上次的资料（{model.draft.visitMaterials?.documents.length}份）<ChevronRight size={17}/></HohoButton></HealthCard>}
        {model.targetRecordId && <div className="vm-target" role="status"><FolderPlus aria-hidden="true" size={17}/><span>补充到：{model.title || '原就诊'}</span></div>}
        {importPanel}
        <HohoButton fullWidth variant="text" className="vm-full-row" onClick={() => openText('supplement')}><PencilLine aria-hidden="true" size={17}/>{model.supplement || '补充一句'}<ChevronRight aria-hidden="true" size={16}/></HohoButton>
        {recent.length > 0 && !model.targetRecordId && <section className="vm-recent"><div className="vm-source-heading"><span>给已有就诊补资料</span>{recent.length > 1 && <HohoButton variant="text" size="small" onClick={() => setSheet('recent')}>选择</HohoButton>}</div><button className="vm-recent-row" type="button" onClick={() => selectRecent(recent[0])}><FolderPlus aria-hidden="true" size={23}/><span><strong>{recent[0].visit?.materials?.title || recent[0].content.split('\n')[0]}</strong><small>{recent[0].timePrecision === 'unknown' ? '就诊时间未注明' : new Date(recent[0].occurredAt).toLocaleDateString('zh-CN')} · {recent[0].attachmentCount}份资料</small></span><ChevronRight size={17}/></button></section>}
      </> : model.stage === 'processing' ? <>
        <div className="vm-between"><HealthTag tone="primary"><SourceIcon size={15}/>{visitMaterialSources[model.source]}</HealthTag><span className="vm-secondary">{model.documents.length}份资料</span></div>
        <div className="vm-file-list">{model.documents.map(document => <HealthCard className="vm-file-row" key={document.id}>
          {thumbnail(document, true)}
          <div className="vm-file-main"><strong>{document.name}</strong><div className="vm-file-status" data-status={document.status}>{document.status === 'ready' ? <Check size={14} aria-hidden="true"/> : document.status === 'failed' ? null : <LoaderCircle aria-hidden="true" className="vm-spinner" size={14}/>}<span>{document.kind === 'link' ? '已保留链接，正文待添加' : statusText[document.status]}</span></div>
          {document.job?.stage === 'reading' && document.job.progress && <small>{document.job.progress.completed}/{document.job.progress.total}页</small>}
          {document.error && <p className="vm-file-error">{document.error}</p>}
          {document.status === 'failed' && <HohoButton size="small" variant="text" disabled={locked} onClick={() => model.retry(document)}>重试这一份</HohoButton>}
          </div><HohoButton size="icon" variant="ghost" disabled={locked || Boolean(document.attachmentId)} aria-label={'移除资料：' + document.name} onClick={() => model.remove(document)}><X size={17}/></HohoButton>
        </HealthCard>)}</div>
        <div className="vm-action-pair vm-add-actions"><HohoButton variant="secondary" disabled={locked || Boolean(model.saved)} onClick={() => cameraMode ? camera.current?.click() : album.current?.click()}>{cameraMode ? <Camera size={18}/> : <Plus size={18}/>} {cameraMode ? '继续拍下一张' : '继续添加'}</HohoButton><HohoButton variant="text" disabled={locked || Boolean(model.saved)} onClick={() => openText('paste')}><ClipboardPaste size={17}/>补充文字</HohoButton></div>
        <section className="vm-process" aria-live="polite"><h2>{processing ? '正在逐份整理资料' : '接下来，核对整理结果'}</h2><ol><li data-done={model.documents.every(document => !['preparing','uploading'].includes(document.status))}>上传原件</li><li data-done={!processing}>识别文字</li><li data-done={!processing && ready > 0}>整理要点</li></ol></section>
        {model.documents.some(document => document.status === 'failed') && <p className="vm-secondary">没识别清的原件也会保留，可以稍后再整理。</p>}
      </> : review}
    </main>
    {model.stage === 'processing' && <footer className="vm-footer"><HohoButton fullWidth disabled={locked || !ready} onClick={() => model.setStage('review')}>{processing ? ready ? '先核对已整理的 ' + ready + ' 份' : '正在整理资料…' : '核对整理结果'}</HohoButton><HohoButton fullWidth variant="text" disabled={model.saving || !model.documents.length} onClick={() => void model.save('originals_only')}>{model.saveLocked ? '重试保存' : '稍后整理，先保存原件'}</HohoButton></footer>}
    {model.stage === 'review' && <footer className="vm-footer"><HohoButton fullWidth loading={model.saving} onClick={() => void model.save('reviewed')}>{model.saveLocked ? '重试保存' : '确认保存资料'}</HohoButton><HohoButton fullWidth variant="text" disabled={locked} onClick={() => void model.save('originals_only')}>仅保存原件</HohoButton></footer>}
    {model.stage === 'saved' && <footer className="vm-footer"><HohoButton fullWidth onClick={() => model.originalsOnly ? void model.editSaved(true) : model.appendSaved()}>{model.originalsOnly ? '继续整理资料' : '继续补充资料'}</HohoButton><div className="vm-action-pair"><HohoButton variant="text" onClick={() => { const result = model.saved; if (result) { if (onViewRecord) onViewRecord(result.eventId, result.recordId); else if (initialRecord) onClose(); else navigate('/health-events?eventId=' + encodeURIComponent(result.eventId) + '&recordId=' + encodeURIComponent(result.recordId), { replace: true }) } }}>查看健康日历</HohoButton><HohoButton variant="text" onClick={() => void model.editSaved(false)}>编辑资料</HohoButton></div>{model.originalsOnly && <HohoButton fullWidth variant="text" onClick={model.appendSaved}>继续补充资料</HohoButton>}{onDelete && <HohoButton fullWidth variant="text" onClick={() => { if (model.saved && window.confirm('删除这份就诊资料？')) void onDelete(model.saved.recordId).catch(cause => model.setError(cause instanceof Error ? cause.message : '删除未完成，请重试')) }}>删除资料</HohoButton>}</footer>}
    {sheet && createPortal(<BottomSheetSurface open label={sheet === 'leave' ? '离开就诊资料' : '就诊资料操作'} title={sheet === 'help' ? '从其他 App 带回资料' : sheet === 'paste' ? '粘贴问诊资料' : sheet === 'supplement' ? '补充一句' : sheet === 'meta' ? '核对基本信息' : sheet === 'related' ? '关联症状事件' : sheet === 'recent' ? '补充到哪次就诊' : '离开就诊资料？'} className="vm-sheet" layerClassName="hoho-bottom-sheet-layer--nested" onClose={() => setSheet(null)} viewportAware footer={sheet === 'paste' || sheet === 'supplement' ? <HohoButton fullWidth disabled={locked || sheet === 'paste' && !text.trim()} onClick={() => { if (sheet === 'paste') model.addText(text); else model.setSupplement(text.trim()); setSheet(null) }}>{sheet === 'paste' ? '添加这段资料' : '完成'}</HohoButton> : sheet === 'meta' ? <HohoButton fullWidth onClick={() => setSheet(null)}>完成核对</HohoButton> : sheet === 'leave' ? <div className="vm-sheet-actions"><HohoButton fullWidth disabled={model.saving} onClick={() => void model.retainDraft().then(leave).catch(cause => model.setError(cause instanceof Error ? cause.message : '草稿未保存，请重试'))}>保存草稿并退出</HohoButton><HohoButton fullWidth variant="secondary" disabled={locked} onClick={() => void model.discardDraft().then(leave).catch(() => model.setError('退出尚未完成，请重试'))}>退出不保存</HohoButton><HohoButton fullWidth variant="text" onClick={() => setSheet(null)}>继续编辑</HohoButton></div> : undefined}>
      {sheet === 'help' ? <div className="vm-help"><p><Images size={20}/><span><strong>截图后上传</strong><small>保留对应提问和回答，长对话可以分多张。</small></span></p><p><ClipboardPaste size={20}/><span><strong>复制对话后粘贴</strong><small>可以分段添加，原文会一起保留。</small></span></p><p><FileUp size={20}/><span><strong>导入 PDF</strong><small>平台提供导出时，保存文件后导入。</small></span></p><p><Link2 size={20}/><span><strong>只有分享链接？</strong><small>粘贴链接可保留来源，正文需要另外添加。</small></span></p></div> : sheet === 'paste' || sheet === 'supplement' ? <label className="hoho-field"><span className="hoho-text-label">{sheet === 'paste' ? '文字或来源链接' : '补充说明（选填）'}</span><textarea aria-label={sheet === 'paste' ? '粘贴对话内容' : '补充说明'} className="hoho-input vm-textarea" value={text} onChange={event => setText(event.target.value)} maxLength={sheet === 'paste' ? 15000 : 1000} rows={7} placeholder={sheet === 'paste' ? '保留提问和回答，可分几次添加。' : '写下需要补充的内容。'}/></label> : sheet === 'meta' ? <div className="vm-sheet-fields"><HohoInput label="资料标题" maxLength={120} value={model.title} onChange={event => model.setTitle(event.target.value)}/><HohoInput label={model.source === 'hospital' ? '实际就诊时间（可留空）' : '实际问诊时间（可留空）'} type="datetime-local" value={model.occurredAt} max={localDateTimeValue()} onChange={event => model.setOccurredAt(event.target.value)}/><HohoInput label={model.source === 'hospital' ? '医院 / 科室' : model.source === 'external_ai' ? 'AI 软件或平台' : '问诊平台 / 医生'} maxLength={120} value={model.institution} onChange={event => model.setInstitution(event.target.value)}/></div> : sheet === 'recent' ? <div>{recent.map(entry => <HohoButton fullWidth variant="text" key={entry.id} onClick={() => selectRecent(entry)}>{entry.visit?.materials?.title || entry.content.split('\n')[0]}<ChevronRight size={17}/></HohoButton>)}</div> : sheet === 'related' ? <div>{symptomEntries.length ? symptomEntries.map(entry => <HohoButton fullWidth variant="text" key={entry.id} onClick={() => { model.chooseTarget(entry.eventId); setSheet(null) }}><Plus size={18}/>{entry.content.split('\n')[0]}{entry.eventId === model.targetEventId && <Check size={17}/>}</HohoButton>) : <p>当前孩子还没有可关联的症状事件。</p>}</div> : <p>这次的原件和编辑内容尚未确认保存。</p>}
    </BottomSheetSurface>, document.body)}
    {edit && createPortal(<BottomSheetSurface open label="编辑整理内容" title={'编辑' + edit.title} layerClassName="hoho-bottom-sheet-layer--nested" className="vm-sheet" viewportAware onClose={() => setEdit(null)} footer={<HohoButton fullWidth onClick={() => { model.setBlocks(current => current.map(block => block.id === edit.id ? { ...edit, edited: true } : block)); setEdit(null) }}>完成</HohoButton>}><label className="hoho-field"><span className="hoho-text-label">按资料原文核对</span><textarea className="hoho-input vm-textarea" aria-label="核对后的内容" rows={8} maxLength={60000} value={edit.text} onChange={event => setEdit({ ...edit, text: event.target.value })}/></label></BottomSheetSurface>, document.body)}
    {original && <VisitOriginal document={original.document} quote={original.quote} eventId={model.saved?.eventId || model.targetEventId} token={token} onClose={() => setOriginal(null)}/>}
  </section></div>
}

function VisitOriginal({ document, eventId, token, quote, onClose }: { document: LocalVisitDocument; eventId: string; token: string; quote?: string; onClose: () => void }) {
  const [url, setUrl] = useState(document.preview ?? ''), [rawUrl, setRawUrl] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController(), urls: string[] = []
    if (document.kind !== 'file') return
    const run = async () => {
      let blob: Blob
      if (document.file) blob = document.file
      else {
        if (!eventId || !document.attachmentId) throw new Error('原件信息未加载，请关闭后重试')
        const response = await fetch('/api/events/' + encodeURIComponent(eventId) + '/attachments/' + encodeURIComponent(document.attachmentId) + '/content', { headers: { Authorization: 'Bearer ' + token }, signal: controller.signal })
        if (!response.ok) throw new Error('原件暂不可用，请重试')
        blob = await response.blob()
      }
      if (controller.signal.aborted) return
      const objectUrl = URL.createObjectURL(blob); urls.push(objectUrl); setRawUrl(objectUrl)
      if (!document.preview) setUrl(objectUrl)
    }
    setError(''); void run().catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '原件未加载') })
    return () => { controller.abort(); urls.forEach(value => URL.revokeObjectURL(value)) }
  }, [document, eventId, token, attempt])
  return createPortal(<BottomSheetSurface open label={'原件：' + document.name} title={document.name} layerClassName="hoho-bottom-sheet-layer--nested" className="vm-sheet" onClose={onClose} viewportAware>
    {quote && <blockquote className="vm-source-quote"><strong>本条对应原文</strong><p>{quote}</p></blockquote>}
    {document.kind !== 'file' ? <p className="vm-paragraph">{document.originalText}</p> : error ? <StatusNotice tone="error" title={error} action={<HohoButton variant="text" onClick={() => setAttempt(value => value + 1)}>重试</HohoButton>}/> : !url ? <p role="status">正在读取原件…</p> : document.mimeType === 'application/pdf' ? <object className="vm-pdf" data={url} type="application/pdf"><p>点击下方查看完整 PDF。</p></object> : <img className="vm-full-image" src={url} alt={'原件：' + document.name} onError={() => setError('当前浏览器暂不能预览此图片，可查看完整原件')}/>}
    {rawUrl && <a className="vm-original-open" href={rawUrl} target="_blank" rel="noreferrer">查看完整原件</a>}
    {document.recognizedText && <details className="vm-recognized"><summary>逐页识别原文</summary><p className="vm-paragraph">{document.recognizedText}</p></details>}
  </BottomSheetSurface>, window.document.body)
}
