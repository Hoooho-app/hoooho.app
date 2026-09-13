import type { MedicalPreparationApiDto } from '../../types'
export type VisitSectionId='overview'|'complaint'|'course'|'temperature'|'medication'|'examinations'|'allergy'|'elimination'|'feeding'|'growth'|'vaccination'|'history'|'family'|'questions'|'attachments'
export interface VisitEvidence{id:string;label:string;lines:string[]}
export interface VisitSection{id:VisitSectionId;label:string;title:string;lines:string[];evidence:VisitEvidence}
export interface VisitSummaryPresentation{complaint:string;longTerm:string;organizer:string;overview:string[];sections:VisitSection[]}
export const visitIndex:Array<{id:VisitSectionId;label:string}>=[['overview','概览'],['complaint','主诉'],['course','病程'],['temperature','体温'],['medication','用药'],['examinations','检查'],['allergy','过敏'],['elimination','排敏'],['feeding','喂养'],['growth','生长'],['vaccination','疫苗'],['history','既往'],['family','家族'],['questions','待明'],['attachments','附件']].map(([id,label])=>({id:id as VisitSectionId,label}))
const clean=(line:string)=>line.replace(/^(标题|当前情况|已记录症状|开始时间|当前状态)：/,'').trim()
const unique=(lines:string[])=>[...new Set(lines.map(clean).filter(Boolean))]
const rules:Record<Exclude<VisitSectionId,'overview'|'complaint'|'course'>,RegExp>={temperature:/体温|℃|测温|腋温|耳温/,medication:/用药|药物|服用|剂量|规格|处方|医嘱/,examinations:/检查|检验|报告|医院|门诊|就诊|医生意见|诊断/,allergy:/过敏|过敏原|反应/,elimination:/排敏|回避|转奶|重新尝试/,feeding:/喂养|饮食|食欲|奶量|进食|排便/,growth:/身高|体重|生长|kg|cm/i,vaccination:/疫苗|接种/,history:/既往|手术|住院|慢性/,family:/家族|遗传|父系|母系/,questions:/待明确|需核对|不完整|尚未确诊|资料不足|冲突/,attachments:/附件|图片|照片|报告文件/}
export function createVisitSummaryPresentation(preparation:MedicalPreparationApiDto):VisitSummaryPresentation{
  const source=new Map(preparation.summary.sections.map(section=>[section.id,section.lines]));const preferences=source.get('visit_preferences')??[]
  const complaint=preferences.find(line=>line.startsWith('主诉：'))?.slice(3)||clean(source.get('current')?.[0]??'本次健康情况');const longTerm=preferences.find(line=>line.startsWith('长期补充：'))?.slice(5)??'';const organizer=preferences.find(line=>line.startsWith('整理人：'))?.slice(4)??''
  const current=unique(source.get('current')??[]),raw=unique(source.get('raw')??[]),history=unique(source.get('history')??[]),profile=unique(source.get('profile')??[]),all=unique([...current,...raw,...history,...profile]);const used=new Set<string>();const sections:VisitSection[]=[]
  const make=(id:VisitSectionId,label:string,title:string,lines:string[]):VisitSection=>({id,label,title,lines,evidence:{id:`evidence-${id}`,label:`${title}的原始依据`,lines}})
  sections.push(make('overview','概览','病情摘要',unique([...current.slice(0,4),...(longTerm?[`另希望了解：${longTerm}`]:[])])));sections.push(make('complaint','主诉','本次就诊目的',unique([complaint,...current.slice(1,5)])))
  const course=unique([...raw,...history].filter(line=>!rules.medication.test(line)&&!rules.examinations.test(line)));if(course.length)sections.push(make('course','病程','病程与关键变化',course))
  for(const item of visitIndex.slice(3)){const pattern=rules[item.id as keyof typeof rules];const lines=all.filter(line=>pattern.test(line)&&!used.has(line));lines.forEach(line=>used.add(line));if(lines.length)sections.push(make(item.id,item.label,item.id==='examinations'?'检查与就诊':item.label,lines))}
  return{complaint,longTerm,organizer,overview:current,sections}
}
