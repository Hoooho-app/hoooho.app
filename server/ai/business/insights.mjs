const field=(record,name)=>record.aiProvenance?.fields?.find(f=>f.name===name)?.value??null
const reference=r=>({recordId:r.id,eventId:r.eventId,quote:r.content,occurredAt:r.journal?.timePrecision==='unknown'||r.aiProvenance?.time?.precision==='unknown'?null:r.occurredAt})
export function memberInsights(records){
  const symptoms=records.filter(r=>r.type==='symptom'||r.journal?.categories?.includes('symptom'))
  const diets=records.filter(r=>r.journal?.categories?.includes('diet'))
  return {provider:'local-facts',foodAssociations:symptoms.flatMap(symptom=>{
    const explicit=new Set(symptom.journal?.symptom?.linkedRecordIds?.diet??[])
    const eligible=diets.filter(d=>explicit.has(d.id)||(Number.isFinite(Date.parse(symptom.occurredAt))&&d.journal?.timePrecision!=='unknown'&&symptom.journal?.timePrecision!=='unknown'&&Date.parse(symptom.occurredAt)>=Date.parse(d.occurredAt)&&Date.parse(symptom.occurredAt)-Date.parse(d.occurredAt)<=4*3600000))
    return eligible.map(d=>({food:d.journal?.diet?.foods??[field(d,'food')].filter(Boolean),amount:d.journal?.diet?.amount??field(d,'amount'),symptom:symptom.journal?.symptom?.narrative??field(symptom,'symptom')??symptom.content,handling:field(symptom,'handling'),relation:explicit.has(d.id)?'用户已关联':'仅时间邻近，未确认关联',sources:[reference(d),reference(symptom)]}))
  }),intakeObservations:diets.map(d=>({food:d.journal?.diet?.foods??[field(d,'food')].filter(Boolean),amount:d.journal?.diet?.amount??field(d,'amount'),observation:field(d,'reaction')??'未记录反应，不等于无反应',sources:[reference(d)]})),boundary:'本地事实投影，不是 AI 诊断；时间关联不代表因果。不建议自行复食或调整剂量。'}
}
