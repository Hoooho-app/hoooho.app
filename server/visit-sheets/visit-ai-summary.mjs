import { createHash } from 'node:crypto'
import { formatChildAgeFromDateKeys } from '../../shared/child-profile-policy.mjs'

export function visitAISources(report) {
  const eligible=report.sources.filter(source => !['legacy', 'attachment'].includes(source.category))
  const refs=new Set([...(report.focusSourceIds??[]),...(report.questionSourceIds??[]),report.complaintSourceId].filter(Boolean))
  const focused=eligible.filter(s=>refs.has(s.id))
  return eligible.filter(s=>refs.has(s.id)||s.relatedSourceIds?.some(id=>refs.has(id))||focused.some(f=>f.relatedSourceIds?.includes(s.id)))
}

export function visitAISummaryInput(report) {
  const clean = value => String(value ?? '')
    .split(report.member.name || '\u0000').join('[当前成员]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[邮箱已隐藏]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号已隐藏]')
  const sources = visitAISources(report)
  const day=value=>!value||!Number.isFinite(Date.parse(value))?null:new Intl.DateTimeFormat('en-CA',{timeZone:report.timezone||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
  const time=value=>{const date=day(value);return date?value.length===10?date:`${date} ${new Intl.DateTimeFormat('en-GB',{timeZone:report.timezone||'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))}`:'未知'}
  const gender={female:'女',male:'男'}[report.member.gender]
  const age=formatChildAgeFromDateKeys(report.member.birthday,day(report.dataAsOf)||'')
  return { visitFacts:{genderKnown:!!gender,ageKnown:!!age,sources:sources.map(s=>({id:s.id,code:s.code??'原始依据',category:s.category,occurredDate:day(s.occurredAt),text:clean(s.text)}))}, sections: [
    {id:'basic',title:'已保存基本信息（非姓名）',lines:[gender?`性别：${gender}`:'性别：未提供',age?`资料截至日年龄：${age}`:'年龄：未提供',`时区：${report.timezone||'Asia/Shanghai'}`]},
    { id: 'current', title: '本次就诊目的', lines: [clean(report.complaint), clean(report.question)].filter(Boolean) },
    ...['record', 'profile'].map(group => ({
      id: group, title: group === 'record' ? '当前成员已保存健康随记' : '当前成员已保存健康档案与事实',
      lines: sources.filter(source => (['record', 'course', 'temperature', 'medication', 'visits', 'allergy', 'observation'].includes(source.category) ? 'record' : 'profile') === group)
        .map(source => clean(`[${source.id}] ${source.code??'原始依据'}；类型：${source.category}；发生：${time(source.occurredAt)}；录入（非发生日期）：${time(source.createdAt)}；${source.identity}：${source.text}`))
    }))
  ] }
}

export const visitAISummaryFingerprint = report => createHash('sha256')
  .update(JSON.stringify(visitAISummaryInput(report))).digest('hex')
