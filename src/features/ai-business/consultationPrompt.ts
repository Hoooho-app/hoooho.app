import type { VisitSheet } from '../../types/visitSheet'
export const doctorQuestionTemplates=['这些记录中，哪些信息需要再核对或补充？','根据本次情况，需要做哪些检查，分别是为了确认什么？','接下来需要记录哪些变化，何时复诊？','现有检查结论有哪些不确定之处？','目前的处理需要向医生确认哪些注意事项？']
export function consultationPrompt(report:VisitSheet,{includeSources=true}={}){
  const ids=new Set([...(report.focusSourceIds??[]),...(report.questionSourceIds??[]),report.complaintSourceId].filter(Boolean)),focused=report.sources.filter(s=>ids.has(s.id))
  const related=includeSources?report.sources.filter(s=>ids.has(s.id)||s.relatedSourceIds?.some(id=>ids.has(id))||focused.some(f=>f.relatedSourceIds?.includes(s.id))):[]
  const birthday=report.member.birthday?new Date(report.member.birthday):null,asOf=new Date(report.dataAsOf),months=birthday&&Number.isFinite(+birthday)&&+birthday<=+asOf?(asOf.getFullYear()-birthday.getFullYear())*12+asOf.getMonth()-birthday.getMonth()-(asOf.getDate()<birthday.getDate()?1:0):null
  return ['请协助我准备与医生沟通。本资料仅涉及当前一名家庭成员；缺失不等于没有，时间先后不等于因果。请区分医生结论、检查原文、家长陈述、疑似和排除，不把历史情况当作当前发作。',`年龄：${months===null?'未提供':months+'个月（截至资料日期）'}；性别：${report.member.gender==='male'?'男':report.member.gender==='female'?'女':'未提供'}`,`本次主诉：${report.complaint}`,`本次想问：${report.question||'待补充'}`,`资料时区：${report.timezone}`,`资料截至：${report.dataAsOf}`,'\n相关时间线与原始依据：',...related.map(s=>`[${s.code??s.id}] ${s.title}\n发生：${s.occurredAt??'未明确'}；录入：${s.createdAt??'未知'}\n${s.text}`),'\n请先指出材料矛盾与缺失，再帮助判断可能原因、适合科室或就诊场景，并整理需要向医生核对的问题。这些判断由外部 AI／医生完成，Hoooho 本身不输出分诊结论。不要猜测未提供的病史、剂量或检查结果。'].join('\n')
}
