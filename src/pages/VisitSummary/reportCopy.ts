import type { VisitSheet, VisitSource } from '../../types/visitSheet'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'

export function matchingSources(sources:VisitSource[],query:string){
  const search=query.trim().toLocaleLowerCase()
  return sources.filter(s=>[s.title,s.text,s.occurredAt,s.createdAt,s.id,s.code].join(' ').toLocaleLowerCase().includes(search))
}

// A consultation brief is not a full archive. Retain only explicit focus links,
// confirmed allergy facts and a clear index back to the complete report.
export function doctorBriefText(report:VisitSheet){
  const refs=new Set([...report.focusSourceIds,...(report.questionSourceIds??[]),report.complaintSourceId].filter(Boolean))
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
    ...(report.aiSummary&&!report.aiSummaryStale?['\nAI 病情摘要（程序核对通过，仍需核对原文）：',report.aiSummary.overview,...report.aiSummary.keyPoints,...report.aiSummary.missingInformation.map(s=>`待核对：${s}`)]:[]),
    '\n本地事实整理：',
    ...report.chapters.filter(c=>['course','medication','allergy','history','temperature','visits'].includes(c.id)).flatMap(c=>{
      const items=(c.overview?.items??[]).filter(i=>i.sourceIds.some(id=>ids.has(id))||(c.id==='allergy'&&i.detail.includes('已明确')))
      return items.length?[`\n${c.title}`,...items.map(i=>`${i.title}；${i.detail} [${sourceRefs(i.sourceIds)}]`)]:[]
    }),
    `\n本次想问（${report.questionOrigin||'家长填写'}）：\n${report.question||'尚未填写'}`,
    `\n相关时间线与原始依据：${related.filter(s=>!['legacy','attachment'].includes(s.category)).map(s=>s.code).join('、')||'暂无明确关联来源'}。完整原文请在情况单按编号查看，或选择完整资料复制。`,
    ...(report.gaps??[]).map(g=>`待核对：${g}`),
    '未记录不等于没有；时间先后不是因果；不替代医生诊断。',
  ].filter(Boolean).join('\n')
}
