import { renderToStaticMarkup } from 'react-dom/server'
import type { VisitSheet } from '../../types/visitSheet'
import { ReportChapter, reportTime, SourceText } from './ReportChapter'
import { PhotoCaption } from './ReportPhotos'
import { offlineRuntime } from './offlineRuntime'
import { MedicalAISummary } from './MedicalAISummary'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { copyNurseConversation, growthReading, visitSignature } from './reportCopy'
import css from './report.css?inline'
import chartCss from '../../components/design-system/FactCharts.css?inline'
import tokens from '../../styles/tokens.css?inline'
import medicationCss from '../NurseStation/medicationReadOnly.css?inline'
export { doctorBriefText } from './reportCopy'

export interface ExportResources { images: Record<string,string>; omitted: string[] }
const emptyResources = ():ExportResources => ({images:{},omitted:[]})
const refs=(report:VisitSheet,ids:string[])=>ids.map(id=>report.sources.find(s=>s.id===id)?.code||'原始依据').join('、')
export function summaryText(report:VisitSheet) {
  return [
    `Hoooho 就诊情况单 · ${report.member.name} · v${report.version}`,
    `资料截至 ${report.dataAsOf}；生成 ${report.generatedAt}；报告编辑 ${report.editedAt||report.generatedAt}；时区 ${report.timezone}`,
    '重点摘要：不包含全部原文和照片，不是完整档案。',
    ...(report.aiSummary && ['openai', 'bailian'].includes(report.aiSummary.provider) ? [
      '\nAI 病情摘要（固定生成快照）：', report.aiSummary.overview,
      ...report.aiSummary.keyPoints, ...report.aiSummary.missingInformation.map(line => `待核对：${line}`),
      ...(report.aiSummaryStale ? ['资料已变化，此 AI 摘要尚未重新生成。'] : [])
    ] : []),
    '\n本地事实整理：',
    `本次主诉：${report.complaint} [${refs(report,report.complaintSourceId?[report.complaintSourceId]:[])}]`,
    ...report.chapters.filter(c=>c.id!=='sources').flatMap(c=>[
      `\n${c.title}`,...(c.overview?.lines??[]),
      ...(c.overview?.items??[]).map(i=>`${i.title}；${i.detail} [${refs(report,i.sourceIds)}]`),
      ...(c.id==='medication'?(report.medicationReminders??[]).map(r=>`${r.plan.medicationName}：${r.plan.startDate} — ${r.plan.endDate||'未设结束日期'}；${r.occurrences.filter(o=>o.completed).length} 次确认使用，${r.occurrences.filter(o=>!o.completed&&Date.parse(o.scheduledAt)<=Date.parse(report.generatedAt)).length} 次到时未确认；未确认不等于未用 [${refs(report,r.sourceIds)}]`):[]),
      ...(report.notes[c.id]?[`家长补充（不改变原记录）：${report.notes[c.id]}`]:[]),
    ]),
    ...(report.notes.sources?[`附件与完整依据 · 家长补充（不改变原记录）：${report.notes.sources}`]:[]),
    ...(report.reading?[`当前情况：${report.reading.description}`,`开始时间：${report.reading.onset}`,`最近变化：${report.reading.change}`,`其他表现：${report.reading.other}`]:[]),
    `\n本次想问（家长确认）：${report.question||'未填写'}`,
    ...(report.questionSourceIds?.length?[`问题来源 ${refs(report,report.questionSourceIds)}`]:[]),
    '\n待核对：',...(report.gaps??[]),...report.warnings,
    '缺失不等于没有；时间先后不是因果；资料整理不代替诊断。',
  ].filter(Boolean).join('\n')
}
export function reportText(report:VisitSheet,includeHistory=false) {
  return [summaryText(report),'\n完整报告范围：'+report.scope,
    ...report.chapters.flatMap(c=>[`\n## ${c.title}`,c.summary,...c.blocks.filter(b=>includeHistory||!b.sourceIds.some(id=>report.sources.find(s=>s.id===id)?.category==='legacy')).flatMap(b=>[b.title,...b.lines,...(b.entries??[]).flatMap(e=>[e.title,...e.lines,refs(report,e.sourceIds)]),...(b.distribution??[]).map(v=>`${v.label}：${v.count}`),b.distributionNote||'',...(b.points??[]).map(p=>`${p.at}：${p.value} ${b.unit}；${p.detail??''} [${refs(report,[p.sourceId])}]`),`依据：${refs(report,b.sourceIds)}`])]),
    '\n## 完整原始依据',...report.sources.filter(s=>includeHistory||s.category!=='legacy').map(s=>`[${s.code}] ${s.title}\n${s.identity}；发生：${s.occurredAt??'未提供'}；录入：${s.createdAt??'未提供'}\n${s.text}`),
    '\n文本只含附件索引，不包含病情原图。',
    ...(includeHistory?report.changes.filter(c=>report.sources.some(s=>s.id===c.sourceId)).map(c=>`${c.at} [${refs(report,[c.sourceId])}]\n修改前：${c.before}\n修改后：${c.after}`):['旧版情况单和编辑日志未纳入此文本。']),
  ].join('\n')
}
// Whitelist the copy DTO, remap internal references and omit unselected image bytes.
function copyReport(report:VisitSheet,resources:ExportResources):VisitSheet {
  const id=(value:string)=>report.sources.find(s=>s.id===value)?.code||'资料引用'
  const eventKeys=new Map(report.sources.filter(s=>s.eventId).map((s,i)=>[s.eventId!,`事件-${i+1}`]))
  const included=new Set(Object.keys(resources.images))
  const photoOrder=[...new Set([...(report.selectedPhotoIds??[]),...included])]
  const mapBlock=(b:VisitSheet['chapters'][number]['blocks'][number])=>({title:b.title,lines:b.lines,distribution:b.distribution,distributionNote:b.distributionNote,locations:b.locations,unit:b.unit,chartMode:b.chartMode,secondary:b.secondary,related:b.related,sourceIds:b.sourceIds.map(id),points:b.points?.map(p=>({...p,sourceId:id(p.sourceId)})),entries:b.entries?.map(e=>({...e,sourceIds:e.sourceIds.map(id)}))})
  return {
    id:'local-copy', memberId:'local-subject',version:report.version, member:{...report.member,avatar:undefined},
    aiSummary:report.aiSummary&&['openai','bailian'].includes(report.aiSummary.provider)?{...report.aiSummary,keyPointEvidence:report.aiSummary.keyPointEvidence?.map(e=>({...e,sourceId:e.sourceId?id(e.sourceId):null}))}:undefined,aiSummaryStale:report.aiSummaryStale,
    timezone:report.timezone,dataAsOf:report.dataAsOf,generatedAt:report.generatedAt,editedAt:report.editedAt,fingerprint:'',scope:report.scope,
    focus:{mode:report.focus.mode,...(report.focus.text?{text:report.focus.text}:{}),...(report.focus.sourceId?{sourceId:id(report.focus.sourceId)}:{})},complaint:report.complaint,complaintSourceId:report.complaintSourceId?id(report.complaintSourceId):null,
    focusSourceIds:report.focusSourceIds.map(id),range:report.range,question:report.question,questionEdited:report.questionEdited,questionOrigin:report.questionOrigin,questionSourceIds:report.questionSourceIds?.map(id),notes:report.notes,
    caseDetails:report.caseDetails,
    reading:report.reading?{...report.reading,sourceIds:report.reading.sourceIds.map(id),courseSourceIds:report.reading.courseSourceIds.map(id),courseGroups:report.reading.courseGroups?.map(g=>({...g,sourceIds:g.sourceIds.map(id),blocks:g.blocks?.map(mapBlock),events:g.events?.map(e=>({...e,sourceIds:e.sourceIds.map(id)}))})),archive:report.reading.archive?.map(g=>({...g,items:g.items.map(item=>({...item,sourceIds:item.sourceIds.map(id)}))})),height:report.reading.height?{...report.reading.height,sourceId:id(report.reading.height.sourceId)}:null,weight:report.reading.weight?{...report.reading.weight,sourceId:id(report.reading.weight.sourceId)}:null}:undefined,
    chapters:report.chapters.map(c=>({...c,blocks:c.blocks.map(mapBlock),overview:c.overview?{lines:c.overview.lines,items:c.overview.items.map(i=>({...i,sourceIds:i.sourceIds.map(id)}))}:undefined})),
    medicationReminders:report.medicationReminders?.map((r,i)=>({id:`reminder-${i+1}`,status:r.status,plan:{...r.plan},totalDays:r.totalDays,sourceIds:r.sourceIds.map(id),occurrences:r.occurrences.map((o,j)=>({id:`occurrence-${i+1}-${j+1}`,scheduledAt:o.scheduledAt,day:o.day,dayIndex:o.dayIndex,weekIndex:o.weekIndex,slotIndex:o.slotIndex,completed:o.completed,sourceId:o.sourceId?id(o.sourceId):undefined}))})),
    sources:report.sources.map(s=>({id:id(s.id),code:id(s.id),category:s.category,title:s.title,text:s.text,identity:s.identity,occurredAt:s.occurredAt,createdAt:s.createdAt,updatedAt:s.updatedAt,timePrecision:s.timePrecision,destinations:s.destinations,locations:s.locations,symptomCategory:s.symptomCategory,narrative:s.narrative,impactLevel:s.impactLevel,nurseConversation:copyNurseConversation(s),relatedSourceIds:s.relatedSourceIds?.map(id),eventId:s.eventId?eventKeys.get(s.eventId):undefined})),
    candidates:report.candidates.map(c=>({...c,sourceId:id(c.sourceId)})),warnings:report.warnings,gaps:report.gaps,
    photos:photoOrder.flatMap(sourceId=>{const photo=report.photos?.find(p=>p.sourceId===sourceId);return photo&&included.has(sourceId)?[{...photo,sourceId:id(photo.sourceId),relatedSourceIds:photo.relatedSourceIds.map(id)}]:[]}),
    selectedPhotoIds:(report.selectedPhotoIds??[]).filter(sourceId=>included.has(sourceId)).map(id),photoKey:report.focus.mode==='custom'?`custom:${report.focus.text}`:report.complaintSourceId?id(report.complaintSourceId):'auto',photoSelections:{},changes:[],
  }
}
export function reportHtml(report:VisitSheet,resources:ExportResources=emptyResources(),editable=true) {
  const copy=copyReport(report,resources)
  const photoElements=copy.photos?.map(p=><figure key={p.sourceId} data-copy-photo={p.sourceId} hidden={!copy.selectedPhotoIds?.includes(p.sourceId)}><a href={resources.images[report.sources.find(s=>s.code===p.sourceId)!.id]}><img src={resources.images[report.sources.find(s=>s.code===p.sourceId)!.id]} alt={p.title}/></a><PhotoCaption photo={p}/><p>{p.sourceId}</p></figure>)
  const body=renderToStaticMarkup(<main className="visit-report visit-offline">
    <header><strong>Hoooho · 就诊情况单</strong><h1>{report.member.name}</h1><p id="copy-revision">原快照 v{report.version} · {editable?'可编辑本地副本，不回写在线档案':'打印快照'}</p><p>资料截至 {reportTime(report.dataAsOf)} · 生成 {reportTime(report.generatedAt)} · 编辑 {reportTime(report.editedAt??report.generatedAt)}</p></header>
    <p>{report.scope}</p><p>包含 {Object.keys(resources.images).length} 张影像原件；其他附件仅为索引，原图未附。文字范围与照片范围分别核对。</p>
    {resources.omitted.length>0&&<p>未附原件：{resources.omitted.join('；')}</p>}
    <MedicalAISummary report={copy} snapshot/>
    <p className="visit-muted">本地事实整理 · 以下保留各章与原始依据</p>
    {copy.warnings.map((warning,i)=><p key={i} className="visit-warning">{warning}</p>)}
    <details className="visit-offline-nav"><summary>章节目录</summary><nav>{copy.chapters.map(c=><a key={c.id} href={`#chapter-${c.id}`}>{c.title}</a>)}</nav></details>
    {editable&&<div className="visit-copy-controls"><button id="copy-download">下载更新副本</button><p id="copy-status" role="status"/></div>}
    {copy.chapters.map(c=><section id={`chapter-${c.id}`} key={c.id} className="visit-chapter"><h2>{c.title}</h2>
      {c.id==='overview'&&<><div className="visit-report-focus"><h1 id="copy-complaint">{copy.complaint}</h1>{editable&&<button id="copy-edit-focus" className="visit-copy-controls">更改主诉</button>}</div><h3>近期相关照片</h3><div className="visit-photo-grid">{photoElements}</div>{!copy.photos?.length&&<p>本文件未附关联照片原图。</p>}{editable&&<button id="copy-edit-photos" className="visit-copy-controls">调整副本展示照片</button>}<section className="visit-question"><h3>本次想问</h3><p id="copy-question">{copy.question||'尚未填写'}</p><p id="copy-question-origin">{copy.questionOrigin}</p><span id="copy-question-sources">{copy.questionSourceIds?.map(id=><a key={id} href={`#${id}`}>{id} 问题原话 </a>)}</span>{editable&&<button id="copy-edit-question" className="visit-copy-controls">编辑本次想问</button>}</section><div hidden id="copy-gaps">{copy.gaps?.map(g=><p key={g}>{g}</p>)}</div></>}
      <div id={c.id==='overview'?'copy-focus-facts':c.id==='course'?'copy-course':undefined}><ReportChapter chapter={{...c,title:''}} report={{...copy,notes:{}}} readOnly/></div>
      {['medication','allergy','history'].includes(c.id)&&<p data-copy-relation/>}
      {c.id==='sources'&&Object.values(copy.notes).some(Boolean)&&<details open={!editable}><summary>历史家长补充 · 报告说明</summary>{Object.entries(copy.notes).filter(([,note])=>note).map(([id,note])=><section key={id}><h3>{copy.chapters.find(c=>c.id===id)?.title}</h3><p data-copy-note={id}>{note}</p></section>)}</details>}
    </section>)}
    <section className="visit-source-appendix"><h2>完整依据附录</h2><p>以下保留本次选择的全部影像；附在这里不表示与本次主诉有关。</p>{copy.sources.map(s=>{const photo=copy.photos?.find(p=>p.sourceId===s.id);const image=photo?resources.images[report.sources.find(original=>original.code===s.id)!.id]:undefined;return <details id={s.id} key={s.id} open><summary>{s.code} · {s.title}</summary><SourceText source={s}/>{s.category==='attachment'&&<p>{image?'原图已嵌入本文件':'原图未附，仅保留索引'}</p>}{image&&<figure data-copy-original={s.id}><a href={image}><img src={image} alt={photo!.title}/></a><PhotoCaption photo={photo!}/></figure>}</details>})}</section>
    {editable&&<dialog id="copy-editor" aria-label="编辑本地副本"/>}
  </main>)
  const data={copyId:crypto.randomUUID(),originalVersion:report.version,localRevision:0,report:copy}
  const json=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Hoooho 就诊情况单</title><style>${tokens}body{margin:0;background:white}*{box-sizing:border-box}${css}${chartCss}${medicationCss}</style></head><body>${body}${editable?`<script id="visit-copy-data" type="application/json">${json}</script><script>(${offlineRuntime.toString()})();</script>`:''}</body></html>`
}
export function downloadContent(content:string,filename:string,type:string) {
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
}
// Immutable consultation snapshot. It never includes account IDs, tokens,
// signed URLs or byte-less claims of offline media availability.
export function consultationHtml(report:VisitSheet,resources:ExportResources=emptyResources(),full=false){
  const copy=copyReport(report,resources),byCode=(code:string)=>report.sources.find(s=>s.code===code)
  const printCopyCss='@media print{.visit-consultation-copy .visit-copy-media img{max-height:220px;object-fit:contain}.visit-consultation-copy .visit-copy-media figure{break-inside:avoid}.visit-consultation-copy .visit-fact-block:has(.visit-observation-entry){break-inside:auto}.visit-consultation-copy a{color:rgb(var(--hoho-color-primary))}}'
  const courseIds=new Set(copy.reading?.courseSourceIds??copy.chapters.find(c=>c.id==='course')?.blocks.filter(b=>!b.secondary).flatMap(b=>b.sourceIds).filter(id=>{const source=copy.sources.find(s=>s.id===id);return source&&source.category!=='attachment'&&!source.category.endsWith('-plan')})??[])
  const referenced=new Set([...copy.focusSourceIds,...courseIds,...(copy.questionSourceIds??[]),...(!copy.aiSummaryStale?report.aiSourceIds?.map(id=>report.sources.find(s=>s.id===id)?.code)??[]:[]),...(!copy.aiSummaryStale?copy.aiSummary?.keyPointEvidence?.map(e=>e.sourceId)??[]:[]),...Object.keys(resources.images).map(id=>report.sources.find(s=>s.id===id)?.code),...(report.selectedPhotoIds??[]).map(id=>report.sources.find(s=>s.id===id)?.code),copy.reading?.height?.sourceId,copy.reading?.weight?.sourceId].filter(Boolean))
  const includedSources=copy.sources.filter(source=>full||referenced.has(source.id))
  const link=(ids:string[])=>ids.map(id=><a key={id} href={`#${id}`}>{id} 查看依据 </a>)
  const reading=copy.reading
  const media=copy.photos??[],focusedMedia=media.filter(photo=>copy.selectedPhotoIds?.includes(photo.sourceId)),otherMedia=media.filter(photo=>!copy.selectedPhotoIds?.includes(photo.sourceId))
  const mediaFigure=(photo:NonNullable<VisitSheet['photos']>[number])=>{const data=resources.images[byCode(photo.sourceId)!.id],i=media.indexOf(photo);return <figure key={photo.sourceId}>{photo.mimeType.startsWith('video/')?<><video controls playsInline preload="metadata" src={data}/><p>若浏览器不支持此格式，请下载原件后用系统播放器查看；文件内原件字节已附。</p><a href={data} download={photo.title}>下载视频原件</a></>:<a href={data}><img src={data} alt={photo.title}/></a>}<figcaption>{String(i+1).padStart(2,'0')} · {photo.mimeType.startsWith('video/')?'视频':'照片'} · {photo.title}</figcaption><PhotoCaption photo={photo}/>{link([photo.sourceId])}</figure>}
  const body=renderToStaticMarkup(<main className="visit-consultation-copy">
    <style>{printCopyCss}</style><header><h1>就诊情况单</h1><p>{copy.member.name} · {copy.member.gender==='female'?'女':copy.member.gender==='male'?'男':'性别未填写'} · {copy.member.birthday?formatAgeFromBirthday(copy.member.birthday,new Date(copy.dataAsOf),copy.timezone):'生日未填写'}</p><p>资料截至 {reportTime(copy.dataAsOf,copy.timezone)} · 整理 {reportTime(copy.editedAt??copy.generatedAt,copy.timezone)}</p><p>固定确认快照 · {full?'情况单与完整资料':'本次就诊重点'} · {copy.scope}</p></header>
    <section><h2>目前情况</h2><h3>{copy.complaint}</h3>{reading&&<><p>{reading.description}</p><dl><dt>开始时间</dt><dd>{reading.onset}</dd><dt>最近变化</dt><dd>{reading.change}</dd><dt>其他表现</dt><dd>{reading.other}</dd></dl>{link(reading.sourceIds)}<p>身高：{reading.height?`${reading.height.value} cm；测量 ${reportTime(reading.height.at)}`:'未填写'} {reading.height&&link([reading.height.sourceId])}<br/>体重：{reading.weight?`${reading.weight.value} kg；测量 ${reportTime(reading.weight.at)}`:'未填写'} {reading.weight&&link([reading.weight.sourceId])}</p></>}{!reading&&Object.entries(copy.caseDetails??{}).map(([key,value])=><p key={key}>家长补充：{value}</p>)}
      {!!focusedMedia.length&&<><h3>本次影像</h3><div className="visit-copy-media">{focusedMedia.map(mediaFigure)}</div></>}
      <p>已内嵌 {Object.keys(resources.images).length} 份影像原件。未嵌入的附件仅为索引，不可离线查看。</p>{resources.omitted.map((message,i)=><p key={i}>原件未附：{message}</p>)}
    </section>
    {!!otherMedia.length&&<section><h2>另选影像原件</h2><p>这些原件由导出时另选；不代表与本次主诉有关。</p><div className="visit-copy-media">{otherMedia.map(mediaFigure)}</div></section>}
    <section><h2>本次想问</h2><p>{copy.question||'尚未填写'}</p>{link(copy.questionSourceIds??[])}</section>
    {(reading?.courseGroups?.length||copy.notes.course)&&<section><h2>相关经过与处理</h2>{reading?.courseGroups?.map(group=><article key={group.id}><h3>{group.title}</h3>{group.lines.map((line,i)=><p key={i}>{line}</p>)}{group.blocks?.map((block,i)=><ReportChapter key={i} chapter={{id:'temperature',title:'',summary:'',blocks:[block]}} report={copy} readOnly/>)}{link(group.sourceIds)}</article>)}{copy.notes.course&&<p>{copy.notes.course}</p>}</section>}
    {copy.aiSummary&&!copy.aiSummaryStale&&<section><h2>病情摘要（仍需核对）</h2><MedicalAISummary report={copy} snapshot/></section>}
    {full&&<section><h2>完整资料档案</h2>{reading?.archive?.map(group=><article key={group.id}><h3>{group.title}</h3>{group.items.map((item,i)=><p key={i}>{item.title} · {item.detail}{group.id!=='allergy'&&link(item.sourceIds)}</p>)}</article>)}{growthReading(copy).map(group=><article key={group.title}><h3>{group.title}</h3>{group.lines.map((line,i)=><p key={i}>{line}</p>)}{link(group.sourceIds)}</article>)}{Object.entries(copy.notes).filter(([key,value])=>key!=='course'&&value).map(([key,value])=><p key={key}>{value}</p>)}</section>}
    <section><h2>{full?'完整原始依据':'本次相关依据'}</h2>{includedSources.map(source=><details open id={source.id} key={source.id}><summary>{source.code} · {source.title}</summary><SourceText source={source}/></details>)}</section>
    <footer>{visitSignature(copy)} · 家长记录与未知信息保留，不代替医生诊断。本文件不回写在线档案。</footer>
  </main>)
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Hoooho 就诊情况单</title><style>${tokens}${css}${chartCss}body{margin:0;background:white}.visit-consultation-copy{max-width:680px;margin:auto;padding:24px;font:15px/1.7 var(--hoho-font-family);color:rgb(var(--hoho-color-text-primary));overflow-wrap:anywhere}.visit-consultation-copy p{white-space:pre-wrap}.visit-consultation-copy section{padding:16px 0;border-top:1px solid rgb(var(--hoho-color-border))}.visit-consultation-copy .visit-copy-media{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.visit-consultation-copy figure{margin:0}.visit-consultation-copy img,.visit-consultation-copy video{max-width:100%;width:100%}.visit-consultation-copy dd{margin:0}.visit-consultation-copy details>summary{padding:12px 0}.visit-consultation-copy button{display:none}@media print{details>*,details:not([open])>*{display:block!important}video{min-height:60px}.visit-consultation-copy{max-width:none;padding:0}}</style></head><body>${body}</body></html>`
}
export function downloadReport(report:VisitSheet,resources:ExportResources=emptyResources()) {downloadContent(reportHtml(report,resources),`Hoooho-就诊情况单-v${report.version}.html`,'text/html;charset=utf-8')}
export function printReport(report:VisitSheet,resources:ExportResources=emptyResources()) {
  const frame=document.createElement('iframe');frame.title='打印当前情况单';frame.style.cssText='position:fixed;width:0;height:0;border:0;';frame.srcdoc=reportHtml(report,resources,false)
  frame.onload=async()=>{await Promise.all([...frame.contentDocument!.images].map(img=>img.decode().catch(()=>{})));frame.contentWindow?.focus();frame.contentWindow?.print();setTimeout(()=>frame.remove(),60000)}
  document.body.append(frame)
}
