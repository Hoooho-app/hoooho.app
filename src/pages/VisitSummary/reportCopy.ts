import type { VisitSheet, VisitSource } from '../../types/visitSheet'
import { calculateGrowthPosition } from '../../features/health-profile/utils/childGrowthReference'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'

export function copyNurseConversation(source: VisitSource) {
  if (!source.nurseConversation?.length) return undefined
  const ids = new Map(source.nurseConversation.map((turn,index) => [turn.id,`${source.code ?? '来源'}-对话-${index+1}`]))
  return source.nurseConversation.map(turn => ({ id:ids.get(turn.id)!,role:turn.role,text:turn.text,at:turn.at,order:turn.order,final:turn.final,status:turn.status,...(turn.correctsTurnId && ids.has(turn.correctsTurnId) ? {correctsTurnId:ids.get(turn.correctsTurnId)!} : {}) }))
}

export function matchingSources(sources:VisitSource[],query:string){
  const search=query.trim().toLocaleLowerCase()
  return sources.filter(s=>[s.title,s.text,s.occurredAt,s.createdAt,s.id,s.code].join(' ').toLocaleLowerCase().includes(search))
}

// A consultation brief is not a full archive. Retain only explicit focus links,
// confirmed allergy facts and a clear index back to the complete report.
export function doctorBriefText(report:VisitSheet){
  const refs=new Set([...report.focusSourceIds,...(report.reading?.courseSourceIds??[]),...(report.questionSourceIds??[]),report.complaintSourceId].filter(Boolean))
  const focused=report.sources.filter(s=>refs.has(s.id))
  const related=report.sources.filter(s=>refs.has(s.id)||s.relatedSourceIds?.some(id=>refs.has(id))||focused.some(f=>f.relatedSourceIds?.includes(s.id)))
  const ids=new Set(related.map(s=>s.id))
  const sourceRefs=(sourceIds:string[])=>sourceIds.map(id=>report.sources.find(s=>s.id===id)?.code??'原始依据').join('、')
  const age=report.member.birthday?formatAgeFromBirthday(report.member.birthday,new Date(report.dataAsOf),report.timezone):'年龄未提供'
  return [
    `Hoooho 本次就诊重点 · ${report.member.name} · ${report.member.gender==='female'?'女':report.member.gender==='male'?'男':'性别未提供'} · ${age} · v${report.version}`,
    `资料截至 ${report.dataAsOf}；时区 ${report.timezone}。本次范围：${report.scope}`,
    '文字摘要，不含照片字节、无关旧问题、旧版情况单或编辑日志；并非医护审核。',
    `\n本次主诉：${report.complaint}`,
    ...(report.reading?[`当前情况：${report.reading.description}`,`开始时间：${report.reading.onset}`,`最近变化：${report.reading.change}`,`其他表现：${report.reading.other}`]:[]),
    ...(report.caseDetails&&!report.reading?Object.entries(report.caseDetails).map(([key,value])=>`家长本次情况补充（${{description:'当前情况',onset:'开始时间',change:'最近变化',other:'其他表现'}[key]}）：${value}`):[]),
    ...(['cm','kg'].map(unit=>{const point=report.chapters.find(c=>c.id==='growth')?.blocks.filter(b=>b.unit===unit).flatMap(b=>b.points??[]).filter(p=>p.value>0&&p.detail!=='待核对').sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];return `${unit==='cm'?'身高':'体重'}：${point?`${point.value} ${unit}；测量 ${point.at} [${sourceRefs([point.sourceId])}]`:'未填写'}`})),
    ...(report.aiSummary&&!report.aiSummaryStale?['\nAI 病情摘要（程序核对通过，仍需核对原文）：',report.aiSummary.overview,...report.aiSummary.keyPoints,...report.aiSummary.missingInformation.map(s=>`待核对：${s}`)]:[]),
    '\n本地事实整理：',
    ...(report.reading?.courseGroups ? report.reading.courseGroups.flatMap(g=>[`\n${g.title}`,...g.lines,`来源：${sourceRefs(g.sourceIds)}`]) : report.chapters.filter(c=>['course','medication','allergy','history','temperature','visits'].includes(c.id)).flatMap(c=>{
      const items=(c.overview?.items??[]).filter(i=>i.sourceIds.some(id=>ids.has(id))||(c.id==='allergy'&&i.detail.includes('已明确')))
      return items.length?[`\n${c.title}`,...items.map(i=>`${i.title}；${i.detail} [${sourceRefs(i.sourceIds)}]`)]:[]
    })),
    ...report.chapters.filter(c=>c.id==='course').flatMap(c=>(c.blocks??[]).filter(b=>b.title==='家长关注与已做处理'&&b.sourceIds.some(id=>ids.has(id))).flatMap(b=>['\n家长关注与已做处理：',...b.lines.map(line=>`${line} [${sourceRefs(b.sourceIds)}]`)])),
    `\n本次想问：\n${report.question||'尚未填写'}`,
    ...(report.notes?.course?[`家长经过与处理补充：${report.notes.course}`]:[]),
    ...(report.selectedPhotoIds?.length?[`影像索引：${report.photos?.filter(p=>report.selectedPhotoIds?.includes(p.sourceId)).map(p=>`${p.mimeType.startsWith('video/')?'视频':'照片'}：${p.title} [${sourceRefs([p.sourceId])}]`).join('；')}。文字不包含原件字节。`]:[]),
    `\n相关时间线与原始依据：${related.filter(s=>!['legacy','attachment'].includes(s.category)).map(s=>s.code).join('、')||'暂无明确关联来源'}。完整原文请在情况单按编号查看，或选择完整资料复制。`,
    ...(report.gaps??[]).map(g=>`待核对：${g}`),
    visitSignature(report),
    '未记录不等于没有；时间先后不是因果；不替代医生诊断。',
  ].filter(Boolean).join('\n')
}

export function visitSignature(report:VisitSheet) {
  const relationship=({father:'爸爸',mother:'妈妈',paternal_grandfather:'爷爷',paternal_grandmother:'奶奶',maternal_grandfather:'外公',maternal_grandmother:'外婆',nanny:'照护者',other:'照护者'} as Record<string,string>)[report.member.primaryRecorderRelationship??'']
  return `由 Hoooho 护士配合家长${relationship?`（${relationship}）`:''}整理`
}
export function growthReading(report:VisitSheet) {
  return (['cm','kg'] as const).flatMap(unit=>{
    const blocks=report.chapters.find(c=>c.id==='growth')?.blocks.filter(b=>b.unit===unit)??[]
    const all=blocks.flatMap(b=>b.points??[]).filter(p=>p.value>0&&p.detail!=='待核对').sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))
    const comparable=blocks.find(b=>b.points?.some(p=>p.sourceId===all.at(-1)?.sourceId))
    const points=(comparable?.points??[]).filter(p=>p.value>0&&p.detail!=='待核对').sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))
    const latest=points.at(-1);if(!latest)return []
    const measure=unit==='cm'?'height':'weight',label=unit==='cm'?'身高 / 身长':'体重'
    const position=calculateGrowthPosition({birthday:report.member.birthday??undefined,gender:report.member.gender==='male'?'male':report.member.gender==='female'?'female':undefined,measuredAt:latest.at,measure,value:latest.value})
    const previous=points.at(-2),delta=previous?Math.round((latest.value-previous.value)*10)/10:null
    return [{title:label,lines:[position?`WHO 同龄同性别参考 ${position.percentileLabel} · ${position.referenceMessage}`:'年龄或性别不在现有参考标准适用范围，暂不计算百分位',previous?`较上一条${delta===0?'无变化':`${delta!>0?'增加':'减少'} ${Math.abs(delta!)} ${unit}`}；现有 ${points.length} 次测量`:'仅有一次有效测量，尚不能判断趋势',...(unit==='kg'&&delta!=null&&delta<0?['先核对称重条件；复测仍持续下降或伴有不适时，带记录咨询医生']:[]),'百分位是参考位置，不能单独判断生长状况'],sourceIds:points.map(p=>p.sourceId)}]
  })
}
