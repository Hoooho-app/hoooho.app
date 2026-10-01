import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileScan, Plus } from 'lucide-react'
import { WebPageHeader } from '../../components/common'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { AIBusinessComposer } from '../../features/ai-business/AIBusinessComposer'
import { useAppStore } from '../../store/useAppStore'
import { loadProfileSections, readProfileSection } from '../../services/profileSectionStorage'
import { quickRecordService } from '../../services/quickRecords'
import { useJournal } from '../HealthEvents/useJournal'
import { RecordOriginals } from '../../features/ai-business/RecordOriginals'
import { healthEventService } from '../../services/healthEvents'
import { healthEventRecordService } from '../../services/healthEventRecords'
import { eventAttachmentService } from '../../services/eventAttachments'
import type { HealthEventRecordApiDto } from '../../types'
import { VaccinationRecordFlow } from '../HealthEvents/VaccinationRecordFlow'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import './healthProfileHome.css'

export function SmartRecordPage() { const memberId=useAppStore(s=>s.currentMemberId); return <MemberMaterials key={memberId} vaccination={false}/> }
export function VaccinationProfilePage() { const memberId=useAppStore(s=>s.currentMemberId); return <MemberMaterials key={memberId} vaccination/> }

function MemberMaterials({vaccination}:{vaccination:boolean}) {
  const { currentMemberId:memberId, authToken, members }=useAppStore(),token=authToken??'',member=members.find(m=>m.id===memberId)
  const [open,setOpen]=useState(false),[revision,setRevision]=useState(0),[notice,setNotice]=useState(''),[error,setError]=useState('')
  const [selection,setSelection]=useState<{eventId:string;recordId:string}|null>(null)
  const [saveKey,setSaveKey]=useState(()=>crypto.randomUUID())
  const journal=useJournal(memberId,token,revision)
  const entries=journal.entries.filter(e=>vaccination?e.categories?.includes('vaccination'):e.attachmentCount>0||e.categories?.some(c=>['examination','visit','other'].includes(c)))
  const today=getLocalDateKey(new Date())??''
  const refresh=async(message:string)=>{
    setNotice(message);setError('')
    try {await loadProfileSections(token,members);setRevision(v=>v+1)} catch {setError('记录已保存，但档案摘要刷新失败，请重试');setRevision(v=>v+1)}
  }
  const legacyVaccine=JSON.parse(readProfileSection(`hoho-health-profile:${memberId}:vaccination`)) as unknown[]
  return <main className="app-shell health-profile-detail-shell"><WebPageHeader fallback="/health-profile" title={vaccination?'疫苗接种记录':'智能记录'}/><div className="page-content health-profile-materials">
    <p>资料归属：{member?.name??'正在加载…'}</p>
    <HohoButton disabled={!member||!token} onClick={()=>{setSaveKey(crypto.randomUUID());setOpen(true)}}>{vaccination?<Plus size={18}/>:<FileScan size={20}/>} {vaccination?'补充接种记录':'上传与智能识别'}</HohoButton>
    {!vaccination&&<><p className="hoho-text-caption">体检报告、检查报告、医疗回执、病历与接种凭证，核对后整理到适用档案。原件及未分类内容仍保留。</p><div className="flex flex-wrap gap-3">{[['allergy','过敏史'],['chronic','慢性病史'],['family-history','家族史'],['surgery','手术史'],['vaccination','疫苗接种记录']].map(([id,title])=><Link key={id} to={`/health-profile/${id}`}>手动补充{title}</Link>)}</div><Link to="/health-profile/examination">历史检查档案与附件</Link></>}
    {vaccination&&legacyVaccine.length>0&&<Link to="/health-profile/legacy/vaccination">查看与补充历史接种档案</Link>}
    {notice&&<p role="status">{notice}</p>}
    {(error||journal.error)&&<StatusNotice title="加载未完成" tone="error">{error||journal.error}<HohoButton variant="text" onClick={()=>void refresh('正在刷新')}>重试</HohoButton></StatusNotice>}
    <h2>{vaccination?'已记录的接种':'报告、原件与上传历史'}</h2>
    {journal.loading&&<p role="status">正在加载…</p>}
    {!journal.loading&&!journal.error&&!entries.length&&<p>暂无{vaccination?'接种记录':'资料'}，可在上方补充。</p>}
    {[...entries].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(entry=><button type="button" key={entry.id} onClick={()=>setSelection({eventId:entry.eventId,recordId:entry.id})}><span>{entry.vaccination?.items.map(i=>i.vaccineName).join('、')||entry.content.slice(0,90)}<small>{entry.timePrecision==='unknown'?'发生时间待确认':entry.occurredAt.slice(0,10)} · {entry.attachmentCount} 份原件</small></span><span aria-hidden="true">›</span></button>)}
  </div>
  {selection&&<MaterialDetail key={selection.recordId} {...selection} memberId={memberId} token={token} onChanged={()=>void refresh('记录已更新')} onClose={()=>setSelection(null)}/>}
  {open&&!vaccination&&<AIBusinessComposer profileMode memberName={member?.name} memberId={memberId} token={token} initialTask="archive" onClose={()=>setOpen(false)} onSaved={message=>void refresh(message)}/>}
  {open&&vaccination&&<VaccinationRecordFlow memberId={memberId} token={token} selectedDay={today} today={today} onBack={()=>setOpen(false)} onClose={()=>setOpen(false)} onSaved={message=>{setOpen(false);void refresh(message)}} onConfirm={async(content,occurredAt,inputChannel,photos,journal)=>{
    await quickRecordService.create({memberId,content,occurredAt,inputChannel,idempotencyKey:saveKey,title:'疫苗接种记录',journal,...(photos.photoIds.length?{photoDraftId:photos.draftId,photoIds:photos.photoIds}:{})},token)
    return '已记录'
  }}/>}</main>
}

function MaterialDetail({eventId,recordId,memberId,token,onChanged,onClose}:{eventId:string;recordId:string;memberId:string;token:string;onChanged:()=>void;onClose:()=>void}) {
  const [record,setRecord]=useState<HealthEventRecordApiDto|null>(null),[originalIds,setOriginalIds]=useState<string[]>([])
  const [content,setContent]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false)
  const [vaccine,setVaccine]=useState<NonNullable<NonNullable<HealthEventRecordApiDto['journal']>['vaccination']>|undefined>()
  useEffect(()=>{const controller=new AbortController();void (async()=>{
    try {const event=await healthEventService.getById(eventId,token,controller.signal);if(event.memberId!==memberId)throw new Error('资料归属不匹配')
      const [records,files]=await Promise.all([healthEventRecordService.list(eventId,token,controller.signal),eventAttachmentService.list(eventId,token,controller.signal)])
      if(controller.signal.aborted)return
      const current=records.find(r=>r.id===recordId)??null;setRecord(current);setContent(current?.content??event.title);setVaccine(current?.journal?.vaccination)
      setOriginalIds(files.filter(f=>!f.recordId||!current||f.recordId===current.id).map(f=>f.id))
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'资料加载失败')}finally{if(!controller.signal.aborted)setLoading(false)}
  })();return()=>controller.abort()},[eventId,recordId,memberId,token])
  return <BottomSheetSurface open label="资料与原件" title="资料与原件" onClose={onClose}><div className="ai-business-composer">
    {loading?<p role="status">正在加载…</p>:<><label>资料内容<textarea value={content} disabled={!record||saving} onChange={e=>setContent(e.target.value)} maxLength={5000}/></label>
      {record?.aiProvenance?.time.precision==='unknown'&&<p>资料发生时间待确认，不以上传时间替代。</p>}
      {vaccine?.items.map((item,index)=><section key={item.id}><label>疫苗名称<input value={item.vaccineName} onChange={e=>setVaccine({...vaccine,items:vaccine.items.map((i,n)=>n===index?{...i,vaccineName:e.target.value}:i)})}/></label><label>剂次<select value={item.doseSequence} onChange={e=>setVaccine({...vaccine,items:vaccine.items.map((i,n)=>n===index?{...i,doseSequence:e.target.value as typeof item.doseSequence}:i)})}>{[['dose_1','第1剂'],['dose_2','第2剂'],['dose_3','第3剂'],['dose_4','第4剂'],['booster','加强'],['unknown','待确认']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label></section>)}
      {!!originalIds.length&&<RecordOriginals eventId={eventId} attachmentIds={originalIds}/>} 
      {record?.aiProvenance?.sources.map((source,i)=><details key={i}><summary>第{source.page}页原话</summary><p>{source.quote}</p></details>)}
      {record&&<HohoButton disabled={saving||!content.trim()||vaccine?.items.some(i=>!i.vaccineName.trim())} loading={saving} onClick={async()=>{setSaving(true);setError('');try{await healthEventRecordService.update(record.id,{content,journal:{...record.journal,...(vaccine?{vaccination:{...vaccine,recognitionStatus:'user_edited'}}:{})}},token);onChanged();onClose()}catch(e){setError(e instanceof Error?e.message:'保存失败，请重试')}finally{setSaving(false)}}}>保存补充</HohoButton>}
    </>}{error&&<p role="alert">{error}</p>}
  </div></BottomSheetSurface>
}
