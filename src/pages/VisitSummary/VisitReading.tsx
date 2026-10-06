import { ChevronDown, ChevronRight, CircleHelp, Folder, History, Pencil, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Avatar } from '../../components/common/Avatar'
import { useAppStore } from '../../store/useAppStore'
import type { VisitChapterId, VisitSheet } from '../../types/visitSheet'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { ReportChapter, reportTime } from './ReportChapter'
import { ReportPhotos } from './ReportPhotos'
import { matchingSources } from './reportCopy'

export const readingCards=[{id:'overview',title:'本次情况'},{id:'medication',title:'本次想问'},{id:'course',title:'经过与处理'},{id:'sources',title:'完整资料'}] as const
export type ReadingEditor='focus'|'question'|'current'|'course'|'data'
export function VisitReading({report,token,onEvidence,onEdit,onMedia,onChoose,opened}: {report:VisitSheet;token:string;onEvidence:(ids:string[])=>void;onEdit:(kind:ReadingEditor)=>void;onMedia:(id:string)=>void;onChoose:()=>void;opened:{id:VisitChapterId;serial:number}}){
  const [folds,setFolds]=useState<Record<string,boolean>>({overview:true}),[search,setSearch]=useState('')
  const [lastOpened,setLastOpened]=useState(opened.serial)
  if(lastOpened!==opened.serial){setLastOpened(opened.serial);setFolds(previous=>({...previous,[opened.id]:true}))}
  const currentMember=useAppStore(s=>s.members.find(m=>m.id===report.memberId))
  const section=(id:VisitChapterId)=>report.chapters.find(c=>c.id===id)!
  const latest=report.sources.find(s=>s.id===(report.reading?.sourceIds[0]??report.focusSourceIds[0]))
  const description=report.caseDetails?.description||report.reading?.description||latest?.narrative||'本次情况待补充'
  const questions=report.questionEdited?report.question.split('\n').filter(line=>line.trim()):[]
  const courseIds=report.reading?.courseSourceIds??[...new Set(section('course').blocks.filter(b=>!b.secondary).flatMap(b=>b.sourceIds))].filter(id=>{const source=report.sources.find(s=>s.id===id);return source&&source.category!=='attachment'&&!source.category.endsWith('-plan')})
  const courseSources=report.sources.filter(s=>courseIds.includes(s.id)).sort((a,b)=>(Date.parse(b.occurredAt??'')||0)-(Date.parse(a.occurredAt??'')||0))
  const measurement=(unit:string)=>section('growth').blocks.filter(b=>b.unit===unit).flatMap(b=>b.points??[]).filter(p=>p.value>0&&p.detail!=='待核对').sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]
  function card(id:VisitChapterId,title:string,icon:ReactNode,kind:ReadingEditor,summary:string,body:ReactNode){return <section className="visit-reading-card" id={`chapter-${id}`} data-reading-card={id}>
    <div className="visit-reading-card-head"><button className="visit-reading-toggle" aria-expanded={!!folds[id]} aria-controls={`reading-${id}`} onClick={()=>setFolds({...folds,[id]:!folds[id]})}><span>{icon}<span><span role="heading" aria-level={2}>{title}</span>{summary&&<small>{summary}</small>}</span></span><ChevronDown size={16} className={folds[id]?'is-open':''}/></button><button className="visit-reading-edit" aria-label={`编辑${title}`} onClick={()=>onEdit(kind)}><Pencil size={14}/>编辑</button></div>
    <div id={`reading-${id}`} hidden={!folds[id]}>{body}</div></section>}
  return <div className="visit-reading">
    <div className="visit-reading-person"><Avatar name={report.member.name} src={currentMember?.avatar??report.member.avatar??undefined} size="sm"/><div><strong>{report.member.name}</strong><small>{report.member.gender==='female'?'女':report.member.gender==='male'?'男':'性别未填写'} · {report.member.birthday?formatAgeFromBirthday(report.member.birthday,new Date(),report.timezone):'生日未填写'}</small></div><div className="visit-reading-growth">{(['cm','kg'] as const).map(unit=>{const point=measurement(unit);return <button key={unit} disabled={!point} onClick={()=>point&&onEvidence([point.sourceId])} aria-label={`${unit==='cm'?'身高':'体重'}测量来源`}><strong>{point?point.value:'未填写'}{point&&<span>{unit}</span>}</strong><small>{unit==='cm'?'身高':'体重'}</small></button>})}</div></div>
    {card('overview','本次情况',<Plus size={19}/>,'current','',<>
      <div className="visit-reading-case"><div><h1>{report.complaint}</h1><small>{report.range.from?`${reportTime(report.range.from,report.timezone)}首次相关记录`:'首次相关记录时间未提供'}</small><p>{description}</p>{report.caseDetails?.description&&<small>家长报告补充，不改写原始记录</small>}</div><aside><button onClick={()=>onEdit('focus')}>更改主诉<ChevronRight size={14}/></button><button disabled={!report.focusSourceIds.length} onClick={()=>onEvidence(report.focusSourceIds)}>查看原话<ChevronRight size={14}/></button></aside></div>
      <dl className="visit-reading-facts"><dt>开始时间</dt><dd>{report.caseDetails?.onset||report.reading?.onset||'具体起病时间待补充'}</dd><dt>最近变化</dt><dd>{report.caseDetails?.change||report.reading?.change||'最近变化待补充'}</dd><dt>其他表现</dt><dd>{report.caseDetails?.other||report.reading?.other||'其他表现未填写'}</dd></dl>
      <ReportPhotos report={report} token={token} onChoose={onChoose} onOpen={onMedia}/>
    </>)}
    {card('medication','本次想问',<CircleHelp size={19}/>,'question',questions.length?`${questions.length}个问题 · ${questions[0]}`:'尚未确认问题',questions.length?<><ol className="visit-reading-questions">{questions.map((question,i)=><li key={i}>{question}</li>)}</ol>{!!report.questionSourceIds?.length&&<button className="visit-text-action" onClick={()=>onEvidence(report.questionSourceIds!)}>查看问题原话</button>}</>:<p>尚未填写本次想问的问题。</p>)}
    {card('course','经过与处理',<History size={19}/>,'course',`${courseSources.length}条经过${report.range.from?` · ${reportTime(report.range.from,report.timezone)}—${reportTime(report.range.to,report.timezone)}`:''}`,<>
      {courseSources.map(source=><article className="visit-reading-course-row" key={source.id}><small>{source.timePrecision==='unknown'?'发生时间未知':reportTime(source.occurredAt,report.timezone)} · {source.identity}</small><p>{source.narrative||source.text}</p><button className="visit-text-action" onClick={()=>onEvidence([source.id])}>查看依据</button></article>)}
      {!courseSources.length&&<p>本次主诉尚无明确关联经过。可在更改主诉时选择相关记录。</p>}
      {report.notes.course&&<div><h3>家长补充</h3><p>{report.notes.course}</p></div>}
      {!!section('medication').blocks.length&&<details><summary>核对完整用药资料（计划与执行分开）</summary><ReportChapter report={report} chapter={{...section('medication'),title:''}} onEvidence={onEvidence}/></details>}
    </>)}
    {card('sources','完整资料',<Folder size={19}/>,'data','既往史、过敏史、原始记录',<>
      {(['history','allergy','temperature','growth','visits'] as const).filter(id=>section(id).blocks.length||report.notes[id]).map(id=><details key={id} className="visit-reading-data-group"><summary>{{history:'既往史与相关背景',allergy:'过敏资料与饮食观察',temperature:'体温记录',growth:'成长与日常',visits:'就诊与检查'}[id]}</summary><ReportChapter report={report} chapter={{...section(id),title:''}} onEvidence={onEvidence}/></details>)}
      {report.aiSummary&&!report.aiSummaryStale&&<details className="visit-reading-data-group"><summary>已确认病情摘要（仍需核对）</summary><p>{report.aiSummary.overview}</p>{report.aiSummary.keyPoints.map((point,i)=><article key={i}><p>{point}</p><button className="visit-text-action" onClick={()=>onEvidence(report.aiSummary?.keyPointEvidence?.[i]?.sourceId?[report.aiSummary.keyPointEvidence[i].sourceId!]:report.aiSourceIds??[])}>核对引用原话</button></article>)}</details>}
      {report.notes.sources&&<><h3>资料说明（家长补充）</h3><p>{report.notes.sources}</p></>}
      <details className="visit-reading-data-group"><summary>原始记录 · {report.sources.length}项来源</summary><label>检索全部资料<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索原文、日期或来源"/></label><p role="status">匹配 {matchingSources(report.sources,search).length} / {report.sources.length} 项资料</p>{matchingSources(report.sources,search).map(source=><button className="visit-source-row" key={source.id} onClick={()=>onEvidence([source.id])}><span><strong>{source.title}</strong><small>{source.code} · {source.identity} · {reportTime(source.occurredAt,report.timezone)}</small></span><ChevronRight size={16}/></button>)}</details>
      {!!report.changes.length&&<details><summary>修改前后对照 · {report.changes.length}项</summary>{report.changes.map((change,i)=><article key={i}><small>{reportTime(change.at)}</small><p>修改前：{change.before}</p><p>修改后：{change.after}</p></article>)}</details>}
    </>)}
    <footer className="visit-reading-footer">Hoooho 虚拟护士整理 · {reportTime(report.editedAt||report.generatedAt,report.timezone)}</footer>
  </div>
}
