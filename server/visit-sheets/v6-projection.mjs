// Compact, source-linked reading summaries. The complete v5 facts remain intact.
import { profileSourceId } from './source-identity.mjs'
const uniq=xs=>[...new Set(xs.filter(Boolean))]
const take=(xs,n=4)=>xs.length<=n?xs:[xs[0],...xs.slice(1,-1).filter((_,i)=>i%Math.ceil((xs.length-2)/(n-2))===0).slice(0,n-2),xs.at(-1)]
const short=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,100)
const status=s=>s==='active'?'进行中':s==='archived'?'已归档':'状态未提供'
export function refineV6(report,input,preferences,now,ownedPhotoIds){
  report.schemaVersion=6
  const source=new Map(report.sources.map(s=>[s.id,s])),refs=new Set(report.focusSourceIds)
  const section=id=>report.chapters.find(c=>c.id===id)
  const display=(date,precision)=>!date||!Number.isFinite(Date.parse(date))?'时间未提供':precision==='day'||precision==='period'?date.slice(0,10):new Intl.DateTimeFormat('zh-CN',{timeZone:input.timezone,month:'numeric',day:'numeric',...(date.length>10?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(date))
  const when=s=>s?.timePrecision==='unknown'?'发生时间未知':s?.occurredAt?display(s.occurredAt,s.timePrecision):'发生时间未提供'
  const item=(s,detail)=>({title:short(s?.narrative||s?.title),detail:detail??`${when(s)} · ${s?.identity||'记录'}`,sourceIds:s?[s.id]:[]})
  for(const c of report.chapters)c.overview={items:[],lines:[]}
  const focused=report.focusSourceIds.map(id=>source.get(id)).filter(Boolean)
  const linked=report.sources.filter(s=>refs.has(s.id)||s.relatedSourceIds?.some(id=>refs.has(id))||focused.some(f=>f.relatedSourceIds?.includes(s.id)))
  const questionSources=linked.filter(s=>!s.attachmentId&&!s.id.startsWith('legacy:')&&/(?:想问|希望了解|想了解|请问|是否.*[？?])/.test(s.text))
  if(!report.questionEdited){
    report.questionSourceIds=questionSources.map(s=>s.id)
    report.question=questionSources.flatMap(s=>s.text.split(/\n/).filter(t=>/(?:想问|希望了解|想了解|请问|是否.*[？?])/.test(t))).slice(0,3).join('\n')
    report.questionOrigin=report.question?'据家长记录整理':'可参考的问题'
    if(!report.question)report.question=focused.length||report.focus.mode==='custom'
      ? '这些表现需要进一步了解或检查什么？\n哪些变化需要记录，何时需要再就医？\n日常照护有哪些需要向医生确认的事项？'
      : '这些已有资料中，有哪些需要向医生补充说明？\n接下来应记录哪些变化，何时需要再就医？'
  }
  const available=new Set(report.photos.map(p=>p.sourceId))
  const selected=preferences.photoSelections?.[report.photoKey]
  report.selectedPhotoIds=selected===undefined?(report.focus.mode==='custom'?[]:report.selectedPhotoIds):selected.filter(id=>available.has(id))
  report.photoSelections[report.photoKey]=selected??report.selectedPhotoIds
  report.photoCandidates=uniq([...report.photoCandidates,...report.selectedPhotoIds])
  if(selected?.every(id=>available.has(id)))report.warnings=report.warnings.filter(w=>w!=='部分原选照片已失效或不再关联本次主诉；未自动换成其他照片。')
  report.photoDetails=Object.fromEntries(Object.entries(preferences.photoDetails??{}).filter(([id])=>(ownedPhotoIds??available).has(id)))
  report.photos=report.photos.map(p=>{
    const d=report.photoDetails[p.sourceId];if(!d)return p
    const capturedAt=d.capturedAt===undefined?p.capturedAt:d.capturedAt
    const precision=d.capturePrecision??(capturedAt?.length===10?'day':capturedAt?'exact':'unknown')
    const photo={...p,title:d.label||p.title,location:d.location||p.location,capturedAt,capturePrecision:precision,timeKind:capturedAt?(precision==='day'?'拍摄日期':'拍摄于'):'上传于（拍摄时间未提供）',annotated:true}
    const s=source.get(p.sourceId);if(s)s.text+=`\n家长照片说明：${photo.title}；${photo.location}；${photo.timeKind} ${capturedAt||p.uploadedAt||'未提供'}。`
    return photo
  })
  const course=section('course')
  course.overview.items=take([...focused].sort((a,b)=>(Date.parse(a.occurredAt||a.createdAt)||0)-(Date.parse(b.occurredAt||b.createdAt)||0))).map(s=>({...item(s),at:s.occurredAt||s.createdAt,timeKind:s.occurredAt?'发生':'录入（发生未知）'}))
  course.overview.lines=[focused.length?'按记录时间排列；最早记录不等于起病。箭头仅表示先后，不表示扩散、因果或疗效。':'此主诉尚无匹配经过，其他已有资料仍保留。']
  section('overview').overview.lines=[]
  // Retain only presentation data from the real reminder snapshot; no account or actor data.
  report.medicationReminders=input.reminders.map(r=>{
    const plan=r.plan,zone=plan.timezone||input.timezone
    const day=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso))
    const completion=c=>c?{id:c.id,occurrenceId:c.occurrenceId,scheduledAt:c.scheduledAt,actualTakenAt:c.actualTakenAt,completedAt:c.completedAt,undoneAt:c.undoneAt??null}:null
    const occurrences=r.occurrences.map(o=>{const d=o.day||day(o.scheduledAt),index=o.dayIndex??Math.max(0,Math.round((Date.parse(d)-Date.parse(plan.startDate))/86400000));return {id:o.id,scheduledAt:o.scheduledAt,day:d,dayIndex:index,weekIndex:o.weekIndex??Math.floor(index/7),slotIndex:o.slotIndex??0,completed:o.completed,completion:completion(o.completion),sourceId:source.has(`dose:${o.id}`)?`dose:${o.id}`:`medication-plan:${r.id}`}})
    return {id:r.id,status:r.status||'unknown',plan:{medicationName:plan.medicationName,amount:plan.amount,unit:plan.unit,route:plan.route,mode:plan.mode,times:plan.times||[],intervalHours:plan.intervalHours,startDate:plan.startDate,endDate:plan.endDate,timezone:zone},totalDays:r.totalDays??(plan.endDate?Math.round((Date.parse(plan.endDate)-Date.parse(plan.startDate))/86400000)+1:null),occurrences,completions:(r.completions||r.occurrences.map(o=>o.completion).filter(Boolean)).map(completion),nextOccurrence:null,sourceIds:[`medication-plan:${r.id}`]}
  })
  section('medication').overview.items=section('medication').blocks.filter(b=>!b.reminderId).slice(0,3).map(b=>({title:short(b.lines[0])||b.title,detail:`${when(source.get(b.sourceIds[0]))} · 已保存用药记录；展开核对用量与途径`,sourceIds:b.sourceIds}))
  for(const r of report.medicationReminders){const confirmed=r.occurrences.filter(o=>o.completed);if(confirmed.length)section('medication').overview.items.push({title:r.plan.medicationName,detail:`${confirmed.length} 次确认使用；计划 ${r.plan.startDate} — ${r.plan.endDate||'未设结束日期'}；未确认不等于未用`,sourceIds:confirmed.map(o=>o.sourceId)})}
  section('medication').overview.lines=report.medicationReminders.length?['按提醒计划和已记录的确认展示；未确认不等于未用，计划到期不等于停药。']:section('medication').blocks.length?[]:['暂无用药或处理资料。']
  const allergy=section('allergy')
  for(const archive of input.profiles.filter(a=>a.sectionId==='allergy'))for(const row of archive.records??[])for(const value of row._allergyArchive?.items??row.items??[row]){
    if(value.profileListDeletedAt||(value.memberId&&value.memberId!==input.member.id))continue
    const s=source.get(profileSourceId(archive.sectionId,value));if(!s)continue
    const state=value.currentStatus??value.certainty,isConfirmed=['confirmed','已明确','医生明确'].includes(state)&&value.category!=='unknown'&&value.name!=='尚未明确'
    const label=isConfirmed?(value.sourceType==='clinician'?'家长记录医生已明确':'按家长档案记录已明确（非医护审核）'):{suspected:'家长怀疑，待确认',investigating:'正在核对',excluded:'家长记录已排除',tolerated:'家长记录可耐受'}[state]||'依据状态未明确'
    if(isConfirmed)allergy.overview.items.push({title:value.name||s.title,detail:label,sourceIds:[s.id]})
    else {const block=allergy.blocks.find(b=>b.sourceIds.includes(s.id));if(block){block.secondary=true;block.title=`${value.name||s.title} · ${label}`}}
  }
  if(!allergy.overview.items.length)allergy.overview.lines.push('尚无按记录已确认的过敏项。待确认、已排除、可耐受或状态未知资料在明细核对，不能视为确诊。')
  for(const task of input.tasks){const effective=task.records.filter(r=>r.status==='effective'&&!r.withdrawnAt).sort((a,b)=>(Date.parse(b.occurredAt)||0)-(Date.parse(a.occurredAt)||0));const latest=effective[0];const result=latest?latest.symptomAnswer==='present'?'已记录有变化':latest.symptomAnswer==='absent'?'明确记录未见变化':'结果未填':'暂无有效观察记录';if(effective.length)allergy.overview.items.push({title:task.displayName,detail:`${status(task.status)}${task.progressionPaused?' · 进阶已暂停':''} · ${effective.length} 条有效记录；${latest?`${display(latest.occurredAt)} · `:''}${result}`,sourceIds:[`observation-plan:${task.id}`,...(latest?[`observation:${latest.id}`]:[])]});else{const b=allergy.blocks.find(b=>b.taskId===task.id);if(b){b.secondary=true;b.title=`${task.displayName} · 观察计划（暂无有效观察记录）`}}}
  const history=section('history');history.overview.items=history.blocks.filter(b=>b.related).slice(0,3).map(b=>({title:b.title,detail:short(b.lines[0]),sourceIds:b.sourceIds}));history.overview.lines=history.overview.items.length?[]:[history.blocks.length?'已有既往资料，与本次的明确关系尚未建立。':'暂无既往与相关背景资料。']
  const temperature=section('temperature');temperature.overview.items=temperature.blocks.map(b=>{const last=b.points?.at(-1);return {title:last?`最近 ${last.value} ${b.unit}`:b.title,detail:last?`${b.title.replace('体温测量 · ','')} · ${b.points.length} 次 · ${Math.min(...b.points.map(p=>p.value))}–${Math.max(...b.points.map(p=>p.value))} ${b.unit} · ${display(last.at)}`:short(b.lines[0]),sourceIds:b.sourceIds}});if(!temperature.overview.items.length)temperature.overview.lines=['暂无体温实测记录。']
  const growth=section('growth');growth.overview.items=growth.blocks.filter(b=>b.points?.length).map(b=>{const p=b.points.at(-1);return {title:`最近${b.title} ${p.value} ${b.unit}`,detail:`${display(p.at)} · 共 ${b.points.length} 次测量`,sourceIds:[p.sourceId]}})
  const daily=[['睡眠','sleep'],['饮食','diet'],['排便 / 排尿','elimination']].map(([label,key])=>{const rs=input.records.filter(r=>r.journal?.categories?.includes(key));return rs.length?`${label} ${rs.length} 条记录`:''}).filter(Boolean)
  growth.overview.lines=daily.length?daily: growth.overview.items.length?[]:['暂无成长与日常资料。']
  const visits=section('visits');visits.overview.items=visits.blocks.slice(0,3).map(b=>({title:b.title,detail:short(b.lines[0]),sourceIds:b.sourceIds}));visits.overview.lines=visits.blocks.length>3?[`共 ${visits.blocks.length} 组资料，展开查看全部。`]:visits.blocks.length?[]:['暂无就诊、检查或医嘱原件。']
  section('sources').overview.lines=['按类别查找；包含未进入本次重点的资料。资料项不等于发作或使用次数。']
  return report
}
