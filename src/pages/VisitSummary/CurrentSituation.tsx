import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Pencil, Plus } from 'lucide-react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { FactLineChart } from '../../components/design-system/FactCharts'
import type { CurrentSituationLine, VisitPoint, VisitSheet } from '../../types/visitSheet'
import { visitSheetService } from '../../services/visitSheets'
import { ReportPhotos } from './ReportPhotos'
import { situationData, situationLineParts } from './currentSituationCopy'
import { SituationDescription } from './SituationDescription'
import type { ReadingEditor } from './VisitReading'

export function CurrentSituation({report,token,busy,onEdit,onChoose,onMedia,organizing=false,organizationError='',onOrganize}:{report:VisitSheet;token:string;busy:boolean;onEdit:(kind:ReadingEditor,line?:number)=>void;onChoose:()=>void;onMedia:(id:string)=>void;organizing?:boolean;organizationError?:string;onOrganize?:()=>void}) {
  const s=situationData(report),[points,setPoints]=useState<VisitPoint[]>([]),[verified,setVerified]=useState(false),[open,setOpen]=useState(false),[selected,setSelected]=useState<VisitPoint|null>(null)
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
  const [originalOpen,setOriginalOpen]=useState(false)
  useEffect(()=>{
    let alive=true,request:AbortController|undefined
    async function refresh(){
      request?.abort();const active=new AbortController();request=active
      setVerified(false)
      try{const result=await visitSheetService.temperature(report.memberId,token,active.signal);if(alive&&!active.signal.aborted){setPoints(result.points);setVerified(true)}}catch{if(alive&&!active.signal.aborted){setPoints([]);setVerified(false)}}
    }
    void refresh()
    const visible=()=>{if(document.visibilityState==='visible')void refresh()}
    window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible)
    const interval=window.setInterval(visible,30000)
    return()=>{alive=false;request?.abort();window.clearInterval(interval);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)}
  },[report.memberId,report.version,token])
  // Keep an already open chart while refreshing, but close it on a confirmed loss of eligibility.
  useEffect(()=>{if(open&&points.length<2)setOpen(false);if(selected&&!points.some(p=>p.sourceId===selected.sourceId&&p.at===selected.at&&p.value===selected.value))setSelected(null)},[points,open,selected])
  useEffect(()=>{
    if(!open)return
    const scroll=root.current?.closest<HTMLElement>('.visit-report-scroll'),previous=scroll?.style.overflowY
    if(scroll){scroll.inert=true;scroll.style.overflowY='hidden'}
    const marker=`temperature:${crypto.randomUUID()}`
    history.pushState({...history.state,visitTemperature:marker},'')
    const back=()=>{setOpen(false)};window.addEventListener('popstate',back)
    return()=>{window.removeEventListener('popstate',back);if(history.state?.visitTemperature===marker)history.back();if(scroll){scroll.inert=false;scroll.style.overflowY=previous??'auto'}requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}))}
  },[open])
  const edit=(title:string,kind:ReadingEditor)=><button className="visit-situation-edit" disabled={busy} aria-label={`编辑${title}`} onClick={()=>onEdit(kind)}><span><Pencil size={12}/>编辑</span></button>
  const temperature=<button ref={trigger} className="visit-text-action visit-temperature-action" onClick={()=>{setSelected(null);setOpen(true)}}>体温曲线</button>
  const symptoms:CurrentSituationLine[]=[...s.symptoms,...(!s.symptoms.some(line=>line.kind==='temperature')&&points.length?[{text:`${points.at(-1)!.value} °C`,kind:'temperature',emphasize:false,sourceIds:[points.at(-1)!.sourceId]}]:[])]
  return <div ref={root} className="visit-current-situation">
    <HohoButton className="visit-situation-primary" disabled={busy} onClick={()=>onEdit('focus')}>{report.focusSourceIds.length||report.focus.mode==='custom'&&report.focus.text?'更改主诉':'选择主诉'}</HohoButton>
    {(!report.focusSourceIds.length&&!(report.focus.mode==='custom'&&report.focus.text))?null:<>
    <section className="visit-situation-block visit-reading-case" aria-label="情况描述">
      <div className="visit-situation-heading"><h3>情况描述<small>本次重点</small></h3>{edit('情况描述','current')}</div>
      <p><SituationDescription report={report}/></p>
      {!!(s.keywords??report.reading?.keywords)?.length&&<div className="visit-reading-keywords" aria-label="症状关键词">{(s.keywords??report.reading!.keywords!).map(word=><span key={word}>{word}</span>)}</div>}
      {!!s.raw.length&&<details className="visit-situation-original" onToggle={event=>setOriginalOpen(event.currentTarget.open)}><summary>{originalOpen?'收起原话':'查看原话'}<ChevronDown size={11}/></summary><div>{s.raw.map(raw=><p key={raw.sourceId}>{raw.text}</p>)}</div></details>}
      {organizing&&<p className="visit-situation-status" role="status">正在整理目前情况…</p>}
      {organizationError&&<div className="visit-situation-status" role="alert"><p>{organizationError}</p><button className="visit-text-action" disabled={busy||organizing} onClick={onOrganize}>重试整理</button></div>}
    </section>
    {!!symptoms.length&&<section className="visit-situation-block" aria-label="症状表现"><div className="visit-situation-heading"><h3>症状表现</h3>{!!s.symptoms.length&&edit('症状表现','symptoms')}</div><div className="visit-situation-facts">{symptoms.map((line,i)=><div className="visit-situation-symptom" key={i}><span className="visit-symptom-label">{line.label??(line.kind==='temperature'?'体温':'症状')}</span><div className="visit-symptom-value"><div className={line.kind==='temperature'?'visit-temperature-line':undefined}>{i<s.symptoms.length?<button className="visit-symptom-line" disabled={busy} aria-label={`编辑症状：${line.text}`} onClick={()=>onEdit('symptoms',i)}>{situationLineParts(line.text,line.emphasis??(line.emphasize?[line.text]:[])).map((p,j)=>p.emphasize?<strong key={j}>{p.text}</strong>:p.text)}</button>:<span>{line.text}</span>}{line.kind==='temperature'&&i===symptoms.findIndex(line=>line.kind==='temperature')&&verified&&points.length>=2&&temperature}</div>{line.note&&<small>{line.note}</small>}</div></div>)}</div></section>}
    {!!s.diet.length&&<section className="visit-situation-block" aria-label="近期饮食"><div className="visit-situation-heading"><h3>近期饮食</h3>{edit('近期饮食','diet')}</div>{s.diet.map((line,i)=><p key={i}>{situationLineParts(line.text,line.emphasis).map((p,j)=>p.emphasize?<strong className="visit-situation-highlight" key={j}>{p.text}</strong>:p.text)}</p>)}</section>}
    {(['changes','treatment'] as const).map(key=>s[key].length?<section className="visit-situation-block" key={key}><div className="visit-situation-heading"><h3>{key==='changes'?'发生与变化':'已做处理'}</h3></div>{s[key].map((line,i)=><p key={i}>{line.text}</p>)}</section>:null)}
    <section className="visit-situation-block" aria-label="附件"><div className="visit-situation-heading"><h3>附件</h3>{!!report.selectedPhotoIds?.length&&<button className="visit-situation-edit" disabled={busy} aria-label="编辑附件" onClick={onChoose}><span><Pencil size={12}/>编辑</span></button>}</div><ReportPhotos report={report} token={token} onChoose={onChoose} onOpen={onMedia} compact/><button className="visit-situation-add" disabled={busy} onClick={onChoose}><Plus size={16}/>添加附件</button></section>
    </>}
    {open&&createPortal(<BottomSheetSurface open viewportAware layerClassName="visit-situation-layer visit-temperature-layer" label="体温曲线" title="体温曲线" onClose={()=>setOpen(false)}><div className="visit-temperature-chart"><FactLineChart points={points} unit="°C" label="体温曲线" presentation="temperature" selectedSourceId={selected?.sourceId} accessibleLabel="体温曲线，点击测量点查看时间和温度" interactivePoints onPoint={id=>setSelected(points.find(p=>p.sourceId===id)??null)}/></div></BottomSheetSurface>,document.body)}
  </div>
}
