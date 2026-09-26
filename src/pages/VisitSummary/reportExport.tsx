import { renderToStaticMarkup } from 'react-dom/server'
import type { VisitSheet } from '../../types/visitSheet'
import { ReportChapter, reportTime, SourceText } from './ReportChapter'
import { PhotoCaption } from './ReportPhotos'
import { offlineRuntime } from './offlineRuntime'
import css from './report.css?inline'
import chartCss from '../../components/design-system/FactCharts.css?inline'
import tokens from '../../styles/tokens.css?inline'

export interface ExportResources { images: Record<string,string>; omitted: string[] }
const emptyResources = ():ExportResources => ({images:{},omitted:[]})
const refs=(report:VisitSheet,ids:string[])=>ids.map(id=>report.sources.find(s=>s.id===id)?.code||'原始依据').join('、')
export function summaryText(report:VisitSheet) {
  return [
    `Hoooho 就诊情况单 · ${report.member.name} · v${report.version}`,
    `资料截至 ${report.dataAsOf}；生成 ${report.generatedAt}；报告编辑 ${report.editedAt||report.generatedAt}；时区 ${report.timezone}`,
    '重点摘要：不包含全部原文和照片，不是完整档案。',
    `本次主诉：${report.complaint} [${refs(report,report.complaintSourceId?[report.complaintSourceId]:[])}]`,
    ...report.chapters.filter(c=>c.id!=='sources').flatMap(c=>[
      `\n${c.title}`,c.summary,
      ...c.blocks.filter(b=>!b.secondary).slice(0,4).flatMap(b=>[b.title,...b.lines, ...(b.distribution||[]).map(d=>`${d.label} ${d.count}`),...(b.points?.length?[`已记录 ${b.points.length} 个数值；${b.points.map(p=>`${p.at} ${p.value}${b.unit} [${refs(report,[p.sourceId])}]`).join('；')}`]:[]),`依据 ${refs(report,b.sourceIds)}`]),
      ...(c.blocks.filter(b=>!b.secondary).length>4?['本摘要选取前 4 个资料组，其他资料见完整报告和来源附录。']:[]),
      ...(report.notes[c.id]?[`家长补充（不改变原记录）：${report.notes[c.id]}`]:[]),
    ]),
    ...(report.notes.sources?[`附件与完整依据 · 家长补充（不改变原记录）：${report.notes.sources}`]:[]),
    `\n本次想问（${report.questionOrigin||'家长填写'}）：${report.question||'未填写'}`,
    ...(report.questionSourceIds?.length?[`问题来源 ${refs(report,report.questionSourceIds)}`]:[]),
    '\n待核对：',...(report.gaps??[]),...report.warnings,
    '缺失不等于没有；时间先后不是因果；资料整理不代替诊断。',
  ].filter(Boolean).join('\n')
}
export function reportText(report:VisitSheet) {
  return [summaryText(report),'\n完整报告范围：'+report.scope,
    ...report.chapters.flatMap(c=>[`\n## ${c.title}`,c.summary,...c.blocks.flatMap(b=>[b.title,...b.lines,...(b.entries??[]).flatMap(e=>[e.title,...e.lines,refs(report,e.sourceIds)]),...(b.distribution??[]).map(v=>`${v.label}：${v.count}`),b.distributionNote||'',...(b.points??[]).map(p=>`${p.at}：${p.value} ${b.unit}；${p.detail??''} [${refs(report,[p.sourceId])}]`),`依据：${refs(report,b.sourceIds)}`])]),
    '\n## 完整原始依据',...report.sources.map(s=>`[${s.code}] ${s.title}\n${s.identity}；发生：${s.occurredAt??'未提供'}；录入：${s.createdAt??'未提供'}\n${s.text}`),
    '\n文本只含附件索引，不包含病情原图。',
    ...report.changes.filter(c=>report.sources.some(s=>s.id===c.sourceId)).map(c=>`${c.at} [${refs(report,[c.sourceId])}]\n修改前：${c.before}\n修改后：${c.after}`),
  ].join('\n')
}
// Whitelist the copy DTO, remap internal references and omit unselected image bytes.
function copyReport(report:VisitSheet,resources:ExportResources):VisitSheet {
  const id=(value:string)=>report.sources.find(s=>s.id===value)?.code||'资料引用'
  const eventKeys=new Map(report.sources.filter(s=>s.eventId).map((s,i)=>[s.eventId!,`事件-${i+1}`]))
  const included=new Set(Object.keys(resources.images))
  const mapBlock=(b:VisitSheet['chapters'][number]['blocks'][number])=>({title:b.title,lines:b.lines,distribution:b.distribution,distributionNote:b.distributionNote,locations:b.locations,unit:b.unit,chartMode:b.chartMode,secondary:b.secondary,related:b.related,sourceIds:b.sourceIds.map(id),points:b.points?.map(p=>({...p,sourceId:id(p.sourceId)})),entries:b.entries?.map(e=>({...e,sourceIds:e.sourceIds.map(id)}))})
  return {
    id:'local-copy', memberId:'local-subject',version:report.version, member:report.member,
    timezone:report.timezone,dataAsOf:report.dataAsOf,generatedAt:report.generatedAt,editedAt:report.editedAt,fingerprint:'',scope:report.scope,
    focus:{...report.focus,...(report.focus.sourceId?{sourceId:id(report.focus.sourceId)}:{})},complaint:report.complaint,complaintSourceId:report.complaintSourceId?id(report.complaintSourceId):null,
    focusSourceIds:report.focusSourceIds.map(id),range:report.range,question:report.question,questionOrigin:report.questionOrigin,questionSourceIds:report.questionSourceIds?.map(id),notes:report.notes,
    chapters:report.chapters.map(c=>({...c,blocks:c.blocks.map(mapBlock)})),
    sources:report.sources.map(s=>({id:id(s.id),code:id(s.id),category:s.category,title:s.title,text:s.text,identity:s.identity,occurredAt:s.occurredAt,createdAt:s.createdAt,updatedAt:s.updatedAt,timePrecision:s.timePrecision,destinations:s.destinations,locations:s.locations,symptomCategory:s.symptomCategory,narrative:s.narrative,impactLevel:s.impactLevel,relatedSourceIds:s.relatedSourceIds?.map(id),eventId:s.eventId?eventKeys.get(s.eventId):undefined})),
    candidates:report.candidates.map(c=>({...c,sourceId:id(c.sourceId)})),warnings:report.warnings,gaps:report.gaps,
    photos:report.photos?.filter(p=>included.has(p.sourceId)).map(p=>({...p,sourceId:id(p.sourceId),relatedSourceIds:p.relatedSourceIds.map(id)})),
    selectedPhotoIds:(report.photos??[]).filter(p=>included.has(p.sourceId)&&p.relatedSourceIds.some(source=>report.focusSourceIds.includes(source))).map(p=>id(p.sourceId)),photoKey:report.focus.mode==='custom'?`custom:${report.focus.text}`:report.complaintSourceId?id(report.complaintSourceId):'auto',photoSelections:{},changes:[],
  }
}
export function reportHtml(report:VisitSheet,resources:ExportResources=emptyResources(),editable=true) {
  const copy=copyReport(report,resources)
  const photoElements=copy.photos?.map(p=><figure key={p.sourceId} data-copy-photo={p.sourceId} hidden={!copy.selectedPhotoIds?.includes(p.sourceId)}><a href={resources.images[report.sources.find(s=>s.code===p.sourceId)!.id]}><img src={resources.images[report.sources.find(s=>s.code===p.sourceId)!.id]} alt={p.title}/></a><PhotoCaption photo={p}/><p>{p.sourceId}</p></figure>)
  const body=renderToStaticMarkup(<main className="visit-report visit-offline">
    <header><strong>Hoooho · 就诊情况单</strong><h1>{report.member.name}</h1><p id="copy-revision">原快照 v{report.version} · {editable?'可编辑本地副本，不回写在线档案':'打印快照'}</p><p>资料截至 {reportTime(report.dataAsOf)} · 生成 {reportTime(report.generatedAt)} · 编辑 {reportTime(report.editedAt??report.generatedAt)}</p></header>
    <p>{report.scope}</p><p>包含 {Object.keys(resources.images).length} 张影像原件；其他附件仅为索引，原图未附。文字范围与照片范围分别核对。</p>
    {resources.omitted.length>0&&<p>未附原件：{resources.omitted.join('；')}</p>}
    {copy.warnings.map((warning,i)=><p key={i} className="visit-warning">{warning}</p>)}
    <details className="visit-offline-nav"><summary>章节目录</summary><nav>{copy.chapters.map(c=><a key={c.id} href={`#chapter-${c.id}`}>{c.title}</a>)}</nav></details>
    {editable&&<div className="visit-copy-controls"><button id="copy-download">下载更新副本</button><p id="copy-status" role="status"/></div>}
    {copy.chapters.map(c=><section id={`chapter-${c.id}`} key={c.id} className="visit-chapter"><h2>{c.title}</h2>
      {c.id==='overview'&&<><div className="visit-report-focus"><h1 id="copy-complaint">{copy.complaint}</h1>{editable&&<button id="copy-edit-focus" className="visit-copy-controls">更改主诉</button>}</div><h3>近期相关照片</h3><div className="visit-photo-grid">{photoElements}</div>{!copy.photos?.length&&<p>本文件未附关联照片原图。</p>}{editable&&<button id="copy-edit-photos" className="visit-copy-controls">调整副本展示照片</button>}</>}
      <div id={c.id==='overview'?'copy-focus-facts':c.id==='course'?'copy-course':undefined}><ReportChapter chapter={{...c,title:'',id:c.id==='overview'?'sources':c.id}} report={{...copy,notes:{}}} readOnly/></div>
      {c.id==='overview'&&<section><h3>集中核对资料缺口</h3><div id="copy-gaps">{copy.gaps?.map(g=><p key={g}>{g}</p>)}</div></section>}
      {['medication','allergy','history'].includes(c.id)&&<p data-copy-relation/>}
      {c.id==='overview'&&<section><h3>本次想问</h3><p id="copy-question">{copy.question||'尚未填写'}</p><p id="copy-question-origin">{copy.questionOrigin}</p><span id="copy-question-sources">{copy.questionSourceIds?.map(id=><a key={id} href={`#${id}`}>{id} 问题原话 </a>)}</span>{editable&&<button id="copy-edit-question" className="visit-copy-controls">编辑本次想问</button>}</section>}
      {(editable||copy.notes[c.id])&&<aside><h3>家长补充</h3><p data-copy-note={c.id}>{copy.notes[c.id]||''}</p>{editable&&<button data-edit-note={c.id} className="visit-copy-controls">补充 / 校订 · {c.title}</button>}</aside>}
    </section>)}
    <section className="visit-source-appendix"><h2>完整依据附录</h2><p>以下保留本次选择的全部影像；附在这里不表示与本次主诉有关。</p>{copy.sources.map(s=>{const photo=copy.photos?.find(p=>p.sourceId===s.id);const image=photo?resources.images[report.sources.find(original=>original.code===s.id)!.id]:undefined;return <details id={s.id} key={s.id} open><summary>{s.code} · {s.title}</summary><SourceText source={s}/>{s.category==='attachment'&&<p>{image?'原图已嵌入本文件':'原图未附，仅保留索引'}</p>}{image&&<figure data-copy-original={s.id}><a href={image}><img src={image} alt={photo!.title}/></a><PhotoCaption photo={photo!}/></figure>}</details>})}</section>
    {editable&&<dialog id="copy-editor" aria-label="编辑本地副本"/>}
  </main>)
  const data={copyId:crypto.randomUUID(),originalVersion:report.version,localRevision:0,report:copy}
  const json=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Hoooho 就诊情况单</title><style>${tokens}body{margin:0;background:white}*{box-sizing:border-box}${css}${chartCss}</style></head><body>${body}${editable?`<script id="visit-copy-data" type="application/json">${json}</script><script>(${offlineRuntime.toString()})();</script>`:''}</body></html>`
}
export function downloadContent(content:string,filename:string,type:string) {
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
}
export function downloadReport(report:VisitSheet,resources:ExportResources=emptyResources()) {downloadContent(reportHtml(report,resources),`Hoooho-就诊情况单-v${report.version}.html`,'text/html;charset=utf-8')}
export function printReport(report:VisitSheet,resources:ExportResources=emptyResources()) {
  const frame=document.createElement('iframe');frame.title='打印当前情况单';frame.style.cssText='position:fixed;width:0;height:0;border:0;';frame.srcdoc=reportHtml(report,resources,false)
  frame.onload=async()=>{await Promise.all([...frame.contentDocument!.images].map(img=>img.decode().catch(()=>{})));frame.contentWindow?.focus();frame.contentWindow?.print();setTimeout(()=>frame.remove(),60000)}
  document.body.append(frame)
}
