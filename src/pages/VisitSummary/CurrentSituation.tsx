import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from '../../components/icons'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { FactLineChart } from '../../components/design-system/FactCharts'
import type { VisitPoint, VisitSheet } from '../../types/visitSheet'
import { visitSheetService } from '../../services/visitSheets'
import { ReportPhotos } from './ReportPhotos'

export function VisitComplaint({ report, token, busy, onChange, onChoose, onMedia }: {
  report: VisitSheet
  token: string
  busy: boolean
  onChange: () => void
  onChoose: () => void
  onMedia: (id: string) => void
}) {
  return <div className="visit-current-situation">
    <p className="visit-chief-text">{report.complaint}</p>
    <HohoButton variant="text" disabled={busy} onClick={onChange}>
      {report.clinical?.scopeKey || report.focusSourceIds.length || report.focus.mode === 'custom' ? '更改主诉' : '选择主诉'}
    </HohoButton>
    <section className="visit-chief-attachments" aria-label="主诉附件">
      <h3>主诉附件</h3>
      <ReportPhotos report={report} token={token} onChoose={onChoose} onOpen={onMedia} compact />
      <button type="button" className="visit-situation-add" disabled={busy} onClick={onChoose}><Plus size={16}/>添加 / 管理附件</button>
    </section>
  </div>
}

export function VisitTemperature({ memberId, token }: { memberId: string; token: string }) {
  const [points, setPoints] = useState<VisitPoint[]>([])
  const [verified, setVerified] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<VisitPoint | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    let alive=true,request:AbortController|undefined
    async function refresh(){
      request?.abort();const active=new AbortController();request=active
      setVerified(false)
      try{const result=await visitSheetService.temperature(memberId,token,active.signal);if(alive&&!active.signal.aborted){setPoints(result.points);setVerified(true)}}catch{if(alive&&!active.signal.aborted){setPoints([]);setVerified(false)}}
    }
    void refresh()
    const visible=()=>{if(document.visibilityState==='visible')void refresh()}
    window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible)
    const interval=window.setInterval(visible,30000)
    return()=>{alive=false;request?.abort();window.clearInterval(interval);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)}
  },[memberId,token])
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
  if (!open && (!verified || points.length < 2)) return null
  return <div ref={root} className="visit-history-temperature">
    <button ref={trigger} className="visit-text-action" onClick={() => { setSelected(null); setOpen(true) }}>体温曲线</button>
    {open&&createPortal(<BottomSheetSurface open viewportAware layerClassName="visit-situation-layer visit-temperature-layer" label="体温曲线" title="体温曲线" onClose={()=>setOpen(false)}><div className="visit-temperature-chart"><FactLineChart points={points} unit="°C" label="体温曲线" presentation="temperature" selectedSourceId={selected?.sourceId} accessibleLabel="体温曲线，点击测量点查看时间和温度" interactivePoints onPoint={id=>setSelected(points.find(p=>p.sourceId===id)??null)}/></div></BottomSheetSurface>,document.body)}
  </div>
}
