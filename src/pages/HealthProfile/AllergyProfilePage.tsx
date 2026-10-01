import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Check, ChevronDown, ChevronRight, CircleHelp, Dog, FileCheck2, History, Leaf, Link2, LoaderCircle, Paperclip, Pill, Plus, Trash2, Utensils, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheetSurface, HohoButton, HohoInput, StatusNotice } from '../../components/design-system'
import {
  activeAllergyReactions, allergyCategoryExamples, allergyCategoryLabels, allergyGroup, allergyReactionSummary, allergySourceLabels,
  allergyStatusLabels, allergyTestResultLabel, applyAllergyReport, formatAllergyDate, readAllergyArchive,
  saveQuickAllergy, serializeAllergyArchive, type AllergyArchive, type AllergyCategory, type AllergyHistoryItem,
  type AllergyReactionRecord, type AllergyReportItem, type AllergyReportRecord, type AllergySourceType,
  type DietaryAction
} from '../../features/health-profile/utils/allergyProfile'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { healthEventService } from '../../services/healthEvents'
import { loadProfileSections, readProfileSection, saveProfileSection } from '../../services/profileSectionStorage'
import { AIBusinessComposer } from '../../features/ai-business/AIBusinessComposer'
import { HealthInsights } from '../../features/ai-business/HealthInsights'
import { useAppStore } from '../../store/useAppStore'
import type { HealthEventApiDto, Member } from '../../types'

const categories:{id:AllergyCategory;icon:typeof Utensils}[]=[
  {id:'food',icon:Utensils},{id:'drug',icon:Pill},{id:'animal',icon:Dog},{id:'environment',icon:Leaf},{id:'contact',icon:Link2},{id:'unknown',icon:CircleHelp}
]
const sourceOptions:Exclude<AllergySourceType,''>[]=['caregiver','journal','desensitization','report','clinician']
const itemPath=(id:string)=>`/health-profile/allergy/${id}`
const nowLocal=()=>{const date=new Date();date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16)}
const today=()=>new Date().toISOString().slice(0,10)

function Header({action,onBack,title}:{action?:ReactNode;onBack:()=>void;title:string}){
  return <header className="allergy-history-header"><button aria-label="返回" onClick={onBack} type="button"><ArrowLeft/></button><h1>{title}</h1><div>{action}</div></header>
}

function Toast({children,onClose}:{children:ReactNode;onClose:()=>void}){
  useEffect(()=>{const timer=window.setTimeout(onClose,2600);return()=>window.clearTimeout(timer)},[onClose])
  return <div className="allergy-toast" role="status"><Check size={18}/><span>{children}</span><button aria-label="关闭提示" onClick={onClose} type="button"><X size={16}/></button></div>
}

export function AllergyHistoryPage(){const member=useCurrentMember();return <AllergyProfilePage member={member} storageKey={`hoho-health-profile:${member.id}:allergy`}/>}

export function AllergyProfilePage({member,storageKey}:{member:Member;storageKey:string}){
  const navigate=useNavigate(),location=useLocation(),accountId=useAppStore(state=>state.authUser?.id??''),token=useAppStore(state=>state.authToken)
  const [archive,setArchive]=useState(()=>readAllergyArchive(readProfileSection(storageKey),member.id,accountId))
  const [events,setEvents]=useState<HealthEventApiDto[]>([]),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [editor,setEditor]=useState<AllergyHistoryItem|null|undefined>(undefined),[reportOpen,setReportOpen]=useState(false)
  const [aiOpen,setAiOpen]=useState(false)
  const parts=location.pathname.split('/').filter(Boolean),sub=parts.slice(2)
  const item=archive.items.find(candidate=>candidate.id===sub[0]&&candidate.memberId===member.id&&(!accountId||candidate.accountId===accountId))

  useEffect(()=>{setArchive(readAllergyArchive(readProfileSection(storageKey),member.id,accountId));setError('')},[accountId,member.id,storageKey])
  useEffect(()=>{if(!token){setEvents([]);return}const controller=new AbortController();healthEventService.list(token,controller.signal).then(data=>setEvents(data.filter(event=>event.memberId===member.id))).catch(()=>setEvents([]));return()=>controller.abort()},[member.id,token])

  const persist=async(next:AllergyArchive)=>{if(saving)return false;const requestMemberId=member.id;setSaving(true);setError('');try{await saveProfileSection(storageKey,serializeAllergyArchive(next));if(useAppStore.getState().currentMemberId!==requestMemberId)return false;setArchive(next);return true}catch{if(useAppStore.getState().currentMemberId===requestMemberId)setError('保存失败，已填写内容仍保留，请检查网络后重试');return false}finally{setSaving(false)}}
  const saveEditor=async(input:Parameters<typeof saveQuickAllergy>[1])=>{const nextItems=saveQuickAllergy(archive.items,input),existed=archive.items.some(item=>item.id===input.id||item.category===input.category&&item.name.trim().toLocaleLowerCase('zh-CN')===input.name.trim().toLocaleLowerCase('zh-CN'));if(await persist({...archive,items:nextItems})){setEditor(undefined);setNotice(existed?'已更新这条过敏史':'已加入过敏史')}}
  const saveReport=async(report:AllergyReportRecord)=>{const next=applyAllergyReport(archive,report);if(await persist(next)){setReportOpen(false);setNotice(report.items.some(line=>line.adopted)?'报告和已核对线索已保存':'报告原件已保存')}}
  const saveReaction=async(record:AllergyReactionRecord)=>{if(!item)return;const next={...archive,items:archive.items.map(entry=>entry.id===item.id?{...entry,reactions:[...entry.reactions,record],lastReactionAt:record.occurredAt,updatedAt:new Date().toISOString()}:entry)};if(await persist(next)){setNotice('症状记录已保存');navigate(itemPath(item.id),{replace:true})}}
  const closeNotice=()=>setNotice('')

  const legacyDetail=sub[1]&&sub[1]!=='reaction'
  if(item&&sub[1]==='reaction')return <ReactionPage error={error} item={item} member={member} saving={saving} onSave={saveReaction}/>
  if(item)return <><DetailPage events={events} item={item} onBack={()=>navigate('/health-profile/allergy',{replace:true})} onEdit={()=>setEditor(item)} onRecord={()=>navigate(`${itemPath(item.id)}/reaction`)}/><QuickAddSheet accountId={accountId} error={error} item={editor??item} member={member} onClose={()=>{if(!saving){setEditor(undefined);setError('')}}} onSave={saveEditor} open={editor!==undefined} saving={saving}/>{notice&&<Toast onClose={closeNotice}>{notice}</Toast>}</>
  if(legacyDetail)return <MissingItem onBack={()=>navigate('/health-profile/allergy',{replace:true})}/>

  return <>
    <Dashboard archive={archive} onAdd={()=>setEditor(null)} onBack={()=>navigate('/health-profile',{replace:true})} onOpen={id=>navigate(itemPath(id))} onReport={()=>setAiOpen(true)}/>
    <button type="button" onClick={()=>setReportOpen(true)}>手动核对上传报告（无需 AI）</button>
    {token&&<HealthInsights key={member.id} memberId={member.id} token={token}/>}
    {aiOpen&&token&&<AIBusinessComposer key={member.id} memberId={member.id} token={token} initialTask="report" onClose={()=>setAiOpen(false)} onSaved={message=>{setNotice(message);void loadProfileSections(token,useAppStore.getState().members).then(()=>{if(useAppStore.getState().currentMemberId===member.id)setArchive(readAllergyArchive(readProfileSection(storageKey),member.id,accountId))})}}/>}
    <QuickAddSheet accountId={accountId} error={error} item={editor??null} member={member} onClose={()=>{if(!saving){setEditor(undefined);setError('')}}} onSave={saveEditor} open={editor!==undefined} saving={saving}/>
    <ReportSheet accountId={accountId} error={error} member={member} onClose={()=>{if(!saving){setReportOpen(false);setError('')}}} onSave={saveReport} open={reportOpen} saving={saving}/>
    {notice&&<Toast onClose={closeNotice}>{notice}</Toast>}
  </>
}

function Dashboard({archive,onAdd,onBack,onOpen,onReport}:{archive:AllergyArchive;onAdd:()=>void;onBack:()=>void;onOpen:(id:string)=>void;onReport:()=>void}){
  const confirmed=archive.items.filter(item=>allergyGroup(item)==='confirmed'),pending=archive.items.filter(item=>allergyGroup(item)==='investigating'),history=archive.items.filter(item=>allergyGroup(item)==='history')
  return <main className="app-shell allergy-shell allergy-history-page">
    <Header action={<button className="allergy-header-add" onClick={onAdd} type="button"><Plus/>添加</button>} onBack={onBack} title="过敏史"/>
    <div className="allergy-history-content">
      <button className="allergy-report-entry" onClick={onReport} type="button"><Paperclip/><span><strong>检查报告</strong><small>{archive.reports.length?`已保存 ${archive.reports.length} 份，可继续上传`:'上传原件并逐项核对'}</small></span><em>上传<Plus/></em></button>
      <HistoryGroup icon={<FileCheck2/>} items={confirmed} label="已明确" onOpen={onOpen}/>
      <HistoryGroup icon={<CircleHelp/>} items={pending} label="待排查" onOpen={onOpen}/>
      {!archive.items.length&&<section className="allergy-history-empty"><h2>还没有过敏史</h2><p>已明确的对象和还没查清的线索，都可以先记录。</p><HohoButton onClick={onAdd}>添加第一条</HohoButton></section>}
      {history.length>0&&<details className="allergy-history-archive"><summary><History/>历史状态 <span>{history.length}</span><ChevronRight/></summary><div>{history.map(item=><AllergyRow item={item} key={item.id} onOpen={onOpen}/>)}</div></details>}
    </div>
  </main>
}

function HistoryGroup({icon,items,label,onOpen}:{icon:ReactNode;items:AllergyHistoryItem[];label:string;onOpen:(id:string)=>void}){
  return <section className="allergy-history-group"><header>{icon}<h2>{label}</h2><span>{items.length}</span></header>{items.length?<div>{items.map(item=><AllergyRow item={item} key={item.id} onOpen={onOpen}/>)}</div>:<p>暂无{label}记录</p>}</section>
}

function AllergyRow({item,onOpen}:{item:AllergyHistoryItem;onOpen:(id:string)=>void}){
  const reaction=activeAllergyReactions(item).at(-1),relations=item.ingredientRelations.filter(value=>value.relation==='candidate')
  return <button className="allergy-history-row" onClick={()=>onOpen(item.id)} type="button"><span className="allergy-history-row__main"><span><strong>{item.name}</strong><em>{allergyCategoryLabels[item.category]}</em></span><small>{item.sourceType==='journal'&&item.sourceReferences.some(value=>value.type==='journal')&&!item.sourceReferences.some(value=>value.type==='journal'&&value.active)?'来源已变更，待核对':item.sourceLabel||reaction&&allergyReactionSummary(reaction)||'信息待补充'}</small></span><ChevronRight/>{relations.length>0&&<span className="allergy-source-preview"><small>可能原料</small><span>{relations.map(value=><em key={value.id}>{value.name}</em>)}</span><small>具体来源待核实</small></span>}</button>
}

interface QuickDraft {name:string;category:AllergyCategory;certainty:'confirmed'|'investigating';reaction:string;occurredAt:string;sourceType:Exclude<AllergySourceType,''>;sourceLabel:string;dietaryAction:DietaryAction;ingredients:string}
function draftFor(item:AllergyHistoryItem|null):QuickDraft{return{name:item?.name??'',category:item?.category??'food',certainty:item?.currentStatus==='confirmed'?'confirmed':'investigating',reaction:'',occurredAt:'',sourceType:item?.sourceType||'caregiver',sourceLabel:item?.sourceLabel??'',dietaryAction:item?.dietaryAction??'',ingredients:item?.ingredientRelations.map(value=>value.name).join('、')??''}}

function QuickAddSheet({accountId,error,item,member,onClose,onSave,open,saving}:{accountId:string;error:string;item:AllergyHistoryItem|null;member:Member;onClose:()=>void;onSave:(input:Parameters<typeof saveQuickAllergy>[1])=>void;open:boolean;saving:boolean}){
  const [draft,setDraft]=useState<QuickDraft>(()=>draftFor(item)),mutationKey=useRef(crypto.randomUUID())
  useEffect(()=>{if(open){setDraft(draftFor(item));mutationKey.current=crypto.randomUUID()}},[item,open])
  const update=<K extends keyof QuickDraft>(key:K,value:QuickDraft[K])=>setDraft(current=>({...current,[key]:value}))
  const submit=(event:FormEvent)=>{event.preventDefault();if(!draft.name.trim()||saving)return;onSave({id:item?.id,mutationKey:mutationKey.current,memberId:member.id,accountId,name:draft.name,category:draft.category,certainty:draft.certainty,reaction:draft.reaction,occurredAt:draft.occurredAt?new Date(draft.occurredAt).toISOString():'',sourceType:draft.sourceType,sourceLabel:draft.sourceLabel,dietaryAction:draft.dietaryAction,ingredientNames:draft.ingredients.split(/[、,，]/).map(value=>value.trim()).filter(Boolean)})}
  return <BottomSheetSurface className="allergy-quick-sheet" footer={<HohoButton disabled={!draft.name.trim()} form="allergy-quick-form" fullWidth loading={saving} size="large" type="submit">保存</HohoButton>} label={item?'编辑过敏史':'添加过敏史'} onClose={onClose} open={open} title={item?'编辑过敏史':'添加过敏史'}>
    <form id="allergy-quick-form" className="allergy-quick-form" onSubmit={submit}>
      <HohoInput autoFocus label="过敏对象" maxLength={60} onChange={event=>update('name',event.target.value)} placeholder="例如：牛乳、猫、青霉素" value={draft.name}/>
      <ChoiceField label="类别"><div className="allergy-category-options">{categories.map(({id,icon:Icon})=><button aria-pressed={draft.category===id} key={id} onClick={()=>update('category',id)} type="button"><Icon/>{allergyCategoryLabels[id]}{draft.category===id&&<Check/>}</button>)}</div></ChoiceField>
      <ChoiceField label="目前状态"><div className="allergy-certainty-options"><button aria-pressed={draft.certainty==='confirmed'} onClick={()=>update('certainty','confirmed')} type="button">已明确{draft.certainty==='confirmed'&&<Check/>}</button><button aria-pressed={draft.certainty==='investigating'} onClick={()=>update('certainty','investigating')} type="button">待排查{draft.certainty==='investigating'&&<Check/>}</button></div></ChoiceField>
      <label className="allergy-sheet-field"><span>反应（选填）</span><input maxLength={160} onChange={event=>update('reaction',event.target.value)} placeholder="例如：接触后打喷嚏" value={draft.reaction}/></label>
      <label className="allergy-sheet-field"><span>来源</span><select onChange={event=>update('sourceType',event.target.value as Exclude<AllergySourceType,''>)} value={draft.sourceType}>{sourceOptions.map(value=><option key={value} value={value}>{allergySourceLabels[value]}</option>)}</select></label>
      <label className="allergy-sheet-field"><span>来源说明（选填）</span><input maxLength={80} onChange={event=>update('sourceLabel',event.target.value)} placeholder="例如：9月复诊时医生告知" value={draft.sourceLabel}/></label>
      <label className="allergy-sheet-field"><span>发生时间（选填）</span><input max={nowLocal()} onChange={event=>update('occurredAt',event.target.value)} type="datetime-local" value={draft.occurredAt}/></label>
      {draft.category==='food'&&<><label className="allergy-sheet-field"><span>可能原料／来源（选填）</span><input maxLength={160} onChange={event=>update('ingredients',event.target.value)} placeholder="按配料或已有资料填写，用顿号分隔" value={draft.ingredients}/><small>只作为待核实关系，不会把食品直接等同为某种成分。</small></label><label className="allergy-dietary-choice"><input checked={draft.dietaryAction==='temporary'} onChange={event=>update('dietaryAction',event.target.checked?'temporary':'')} type="checkbox"/><span/><strong>暂时同步到忌口出示卡</strong><small>仅在你明确选择后同步；已明确的食物会自动同步。</small></label></>}
      {error&&<StatusNotice tone="error" title={error}/>}<p className="allergy-sheet-note">名称相似不会自动合并；保存后仍可回到详情补充证据。</p>
    </form>
  </BottomSheetSurface>
}

function ChoiceField({children,label}:{children:ReactNode;label:string}){return <fieldset className="allergy-sheet-choice"><legend>{label}</legend>{children}</fieldset>}

function newReportLine():AllergyReportItem{return{id:`report-item-${crypto.randomUUID()}`,name:'',category:'food',result:'',testedAt:today(),adopted:true,unclear:true,originalName:'',originalResult:''}}
function ReportSheet({accountId,error,member,onClose,onSave,open,saving}:{accountId:string;error:string;member:Member;onClose:()=>void;onSave:(report:AllergyReportRecord)=>void;open:boolean;saving:boolean}){
  const [file,setFile]=useState<{name:string;type:string;dataUrl:string}|null>(null),[lines,setLines]=useState<AllergyReportItem[]>([]),[fileError,setFileError]=useState(''),[reading,setReading]=useState(false)
  useEffect(()=>{if(open){setFile(null);setLines([]);setFileError('')}},[open])
  const choose=async(list:FileList|null)=>{const selected=list?.[0];if(!selected)return;if(selected.size>8*1024*1024){setFileError('单个文件不能超过 8MB');return}if(!selected.type.startsWith('image/')&&selected.type!=='application/pdf'){setFileError('仅支持图片或 PDF');return}setReading(true);setFileError('');try{const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(selected)});setFile({name:selected.name,type:selected.type,dataUrl});setLines([newReportLine()])}catch{setFileError('原件读取失败，请重新选择')}finally{setReading(false)}}
  const update=(id:string,change:Partial<AllergyReportItem>)=>setLines(current=>current.map(line=>line.id===id?{...line,...change}:line))
  const submit=()=>{if(!file||saving)return;const timestamp=new Date().toISOString();onSave({recordType:'allergy-report',id:`report-${crypto.randomUUID()}`,accountId,memberId:member.id,fileName:file.name,mimeType:file.type,dataUrl:file.dataUrl,recognitionStatus:'manual_review_required',items:lines,createdAt:timestamp,updatedAt:timestamp})}
  return <BottomSheetSurface className="allergy-report-sheet" footer={<HohoButton disabled={!file||reading} fullWidth loading={saving} onClick={submit} size="large">保存报告和采用项</HohoButton>} label="检查报告上传与核对" onClose={onClose} open={open} size="workspace" title="检查报告／上传">
    <div className="allergy-report-form">
      {!file?<><label className="allergy-report-picker"><Paperclip/><strong>{reading?'正在读取…':'选择报告图片或 PDF'}</strong><small>当前没有可用的自动识别能力，上传后由你逐项核对。</small><input accept="image/*,application/pdf" onChange={event=>void choose(event.target.files)} type="file"/></label>{fileError&&<StatusNotice tone="error" title={fileError}/>}</>:<>
        <section className="allergy-report-file"><FileCheck2/><span><strong>{file.name}</strong><small>原件已就绪 · 未使用自动识别</small></span><a href={file.dataUrl} rel="noreferrer" target="_blank">查看原件</a></section>
        <StatusNotice title="请按原报告逐项填写；阳性只作为待排查线索，阴性不会删除已有过敏史。"/>
        {lines.map((line,index)=><section className="allergy-report-line" key={line.id}><header><strong>报告项目 {index+1}</strong><label><input checked={line.adopted} onChange={event=>update(line.id,{adopted:event.target.checked})} type="checkbox"/>采用</label><button aria-label={`删除报告项目${index+1}`} onClick={()=>setLines(current=>current.filter(item=>item.id!==line.id))} type="button"><Trash2/></button></header><label>对象<input onChange={event=>update(line.id,{name:event.target.value,unclear:false})} placeholder="按报告填写" value={line.name}/></label><label>类别<select onChange={event=>update(line.id,{category:event.target.value as AllergyCategory})} value={line.category}>{categories.map(({id})=><option key={id} value={id}>{allergyCategoryLabels[id]}</option>)}</select></label><label>检查结果<select onChange={event=>update(line.id,{result:event.target.value as AllergyReportItem['result']})} value={line.result}><option value="">识别不清／未填写</option><option value="positive">阳性</option><option value="negative">阴性</option><option value="borderline">临界</option></select></label><label>报告日期<input max={today()} onChange={event=>update(line.id,{testedAt:event.target.value})} type="date" value={line.testedAt}/></label>{line.unclear&&<small>该项尚未核对，不会自动采用。</small>}</section>)}
        <button className="allergy-report-add-line" onClick={()=>setLines(current=>[...current,newReportLine()])} type="button"><Plus/>添加报告项目</button>
        {error&&<StatusNotice tone="error" title={error}/>}<button className="allergy-report-replace" onClick={()=>{setFile(null);setLines([])}} type="button">重新选择原件</button>
      </>}
    </div>
  </BottomSheetSurface>
}

function DetailPage({events,item,onBack,onEdit,onRecord}:{events:HealthEventApiDto[];item:AllergyHistoryItem;onBack:()=>void;onEdit:()=>void;onRecord:()=>void}){
  const candidates=useMemo(()=>events.filter(event=>!item.evidenceLinks.some(link=>link.healthEventId===event.id)&&(event.title.includes(item.name)||event.eventSummary?.displayedResult.summary?.includes(item.name)||event.category==='allergy')).slice(0,3),[events,item])
  const reactions=activeAllergyReactions(item).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)),tests=[...item.tests].sort((a,b)=>b.testedAt.localeCompare(a.testedAt))
  return <main className="app-shell allergy-shell allergy-detail-page"><Header action={<button className="allergy-header-text" onClick={onEdit} type="button">编辑</button>} onBack={onBack} title="过敏史"/><div className="allergy-history-content">
    <section className="allergy-detail-summary"><span><strong>{item.name}</strong><small>{allergyCategoryLabels[item.category]} · {allergyGroup(item)==='confirmed'?'已明确':allergyGroup(item)==='history'?allergyStatusLabels[item.currentStatus as Exclude<typeof item.currentStatus,''>]:'待排查'}</small></span><em>{item.sourceType==='journal'&&item.sourceReferences.some(value=>value.type==='journal')&&!item.sourceReferences.some(value=>value.type==='journal'&&value.active)?'来源已变更，待核对':item.sourceLabel||'来源待补充'}</em></section>
    <div className="allergy-detail-metrics"><span><strong>{reactions.length}</strong>次反应</span><span><strong>{tests.length}</strong>份检查</span><span><strong>{item.sourceReferences.length}</strong>条来源</span></div>
    <button className="allergy-detail-primary" onClick={onRecord} type="button"><Plus/>记录一次症状<ChevronRight/></button>
    {item.ingredientRelations.length>0&&<section className="allergy-detail-section"><h2>食品与可能来源</h2><div className="allergy-detail-relations"><strong>{item.name}</strong><ChevronRight/>{item.ingredientRelations.map(relation=><span key={relation.id}>{relation.name}<small>{relation.relation==='candidate'?'候选原料':'已核实来源'}</small></span>)}</div><p>候选关系按已填写配料或来源保存；具体来源仍需核实。</p></section>}
    {item.sourceReferences.length>0&&<section className="allergy-detail-section"><h2>来源与原始证据</h2>{item.sourceReferences.map(reference=><article className="allergy-evidence-row" key={reference.id}><span><strong>{reference.label}</strong><small>{reference.occurredAt?formatAllergyDate(reference.occurredAt):'时间未填写'} · {reference.active?'当前可追溯':'来源已变更'}</small></span></article>)}</section>}
    {reactions.length>0&&<section className="allergy-detail-section"><h2>症状与观察</h2>{reactions.map(record=><article className="allergy-inline-record" key={record.id}><strong>{allergyReactionSummary(record)}</strong><small>{formatAllergyDate(record.occurredAt)}{record.latency?` · 接触后${record.latency}`:''}</small>{record.notes&&<p>{record.notes}</p>}</article>)}</section>}
    {tests.length>0&&<section className="allergy-detail-section"><h2>检查与报告</h2>{tests.map(record=><article className="allergy-inline-record" key={record.id}><strong>{record.testType||'检查报告'} · {allergyTestResultLabel(record.result)}</strong><small>{formatAllergyDate(record.testedAt)} · 单项结果不等于确诊</small>{record.reportFiles[0]&&<a href={record.reportFiles[0]} rel="noreferrer" target="_blank">查看报告原件</a>}</article>)}</section>}
    {item.evidenceLinks.length>0&&<section className="allergy-detail-section"><h2>关联的健康随记</h2>{item.evidenceLinks.map(link=><article className="allergy-evidence-row" key={link.id}><span><strong>{item.sourceReferences.find(reference=>reference.id===`journal:${link.healthRecordId}`)?.active===false?'来源已变更，等待重新核对':'用户已确认关联'}</strong><small>原始记录 ID：{link.healthRecordId||link.healthEventId}</small>{link.healthRecordId&&item.sourceReferences.find(reference=>reference.id===`journal:${link.healthRecordId}`)?.active!==false&&<a href={`/health-events?eventId=${encodeURIComponent(link.healthEventId)}&recordId=${encodeURIComponent(link.healthRecordId)}`}>查看随记与原件</a>}</span></article>)}</section>}
    {candidates.length>0&&<section className="allergy-detail-section allergy-candidate-note"><h2>可能相关的已有观察</h2><p>发现 {candidates.length} 条名称或类别相关的健康随记。只有用户确认后才建立关联，不据此判断因果。</p></section>}
    {item.history.length>0&&<details className="allergy-history-log"><summary><History/>历史变化 <span>{item.history.length}</span><ChevronDown/></summary>{[...item.history].reverse().map(entry=><article key={entry.id}><strong>{entry.label}</strong><small>{formatAllergyDate(entry.occurredAt)} · {entry.sourceType?allergySourceLabels[entry.sourceType as Exclude<AllergySourceType,''>]:'手工记录'}</small></article>)}</details>}
  </div></main>
}

function ReactionPage({error,item,member,onSave,saving}:{error:string;item:AllergyHistoryItem;member:Member;onSave:(record:AllergyReactionRecord)=>void;saving:boolean}){
  const navigate=useNavigate(),[systems,setSystems]=useState<string[]>([]),[latency,setLatency]=useState(''),[more,setMore]=useState(false),[occurredAt,setOccurredAt]=useState(nowLocal()),[details,setDetails]=useState({symptoms:'',exposureAmount:'',bodyLocations:'',handling:'',notes:''})
  const toggle=(value:string)=>setSystems(values=>values.includes(value)?values.filter(item=>item!==value):[...values,value]),update=(key:keyof typeof details,value:string)=>setDetails(current=>({...current,[key]:value}))
  const submit=(event:FormEvent)=>{event.preventDefault();if(!systems.length||!latency)return;onSave({id:`reaction-${crypto.randomUUID()}`,allergyItemId:item.id,memberId:member.id,symptomSystems:systems,symptoms:details.symptoms,exposureAmount:details.exposureAmount,latency,bodyLocations:details.bodyLocations,handling:details.handling,aggravatingFactors:'',relievingFactors:'',occurredAt:new Date(occurredAt).toISOString(),photos:[],notes:details.notes})}
  return <main className="app-shell allergy-shell"><Header onBack={()=>navigate(itemPath(item.id),{replace:true})} title="记录一次症状"/><form className="allergy-content allergy-form" onSubmit={submit}><section className="allergy-detail-summary"><span><strong>{item.name}</strong><small>{allergyCategoryLabels[item.category]} · 保留原始描述</small></span></section><Choice required title="出现了哪些表现？" options={['皮肤','消化道','呼吸道','口腔／面部','全身','其他']} selected={systems} onToggle={toggle}/><label className="allergy-text-field">具体表现（选填）<textarea onChange={event=>update('symptoms',event.target.value)} placeholder="例如：嘴角发红，持续约半小时" rows={3} value={details.symptoms}/></label><Choice required title="接触后多久出现？" options={['立即','2小时内','当天稍后','说不清']} selected={[latency]} onToggle={setLatency}/><button aria-expanded={more} className="allergy-more-fields" onClick={()=>setMore(value=>!value)} type="button">更多信息：接触量、身体部位和处理经过 <ChevronDown/></button>{more&&<div className="allergy-extra-fields"><label>接触量（选填）<input onChange={event=>update('exposureAmount',event.target.value)} value={details.exposureAmount}/></label><label>身体部位（选填）<input onChange={event=>update('bodyLocations',event.target.value)} value={details.bodyLocations}/></label><label>处理经过（选填）<textarea onChange={event=>update('handling',event.target.value)} value={details.handling}/></label><label>备注（选填）<textarea onChange={event=>update('notes',event.target.value)} value={details.notes}/></label></div>}<label className="allergy-date-field">发生时间<input max={nowLocal()} onChange={event=>setOccurredAt(event.target.value)} required type="datetime-local" value={occurredAt}/></label>{error&&<StatusNotice tone="error" title={error}/>}<HohoButton disabled={!systems.length||!latency} fullWidth loading={saving} size="large" type="submit">保存这次症状</HohoButton></form></main>
}

function Choice({onToggle,options,required=false,selected,title}:{onToggle:(value:string)=>void;options:string[];required?:boolean;selected:string[];title:string}){return <fieldset aria-required={required} className="allergy-choice"><legend>{title}{required&&<em>必选</em>}</legend><div>{options.map(value=><button aria-pressed={selected.includes(value)} key={value} onClick={()=>onToggle(value)} type="button">{value}{selected.includes(value)&&<Check/>}</button>)}</div></fieldset>}
function MissingItem({onBack}:{onBack:()=>void}){return <main className="app-shell allergy-shell"><Header onBack={onBack} title="过敏史"/><div className="allergy-history-content"><StatusNotice tone="error" title="没有找到当前家庭成员的这条过敏史"/></div></main>}
