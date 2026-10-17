import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { JournalIndexService } from '../events/journal-index-service.mjs'
import { CaseContinuityService } from '../events/case-continuity-service.mjs'
import { MedicationReminderService } from '../medication-reminders/medication-reminder-service.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'

const zone='Asia/Shanghai'
const dayAt=value=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value)
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value
const fail=(message,code,status=400)=>Object.assign(new Error(message),{code,status})

// Only authoritative stores are read. Clients cannot supply a model, HTML,
// record count or a claimed successful result to consume a voucher.
export async function buildReviewSnapshot({accountId,memberId,start,end,now=new Date(),dataDirectory}) {
  if(!validDay(start)||!validDay(end)||start>end||end>dayAt(now))throw fail('请选择有效的回顾日期','INVALID_REVIEW_RANGE')
  const member=await new FamilyMemberRepository(dataDirectory).findById(memberId)
  if(!member||member.accountId!==accountId)throw fail('未找到当前孩子','MEMBER_NOT_FOUND',404)
  const options={dataDirectory},indexService=new JournalIndexService(options)
  const [index,cases,profileData,reminders]=await Promise.all([
    indexService.list(accountId,memberId,zone),
    new CaseContinuityService({...options,now:()=>now}).list(accountId,memberId,zone),
    new JsonStore(path.join(dataDirectory,'health-profile-sections.json'),{sections:[]}).read(),
    new MedicationReminderService(options).list(accountId,memberId,now),
  ])
  const profiles=profileData.sections.filter(section=>section.accountId===accountId&&section.memberId===memberId)
  const eventIds=new Set(index.events.map(event=>event.id))
  const effective=index.records.some(record=>{
    if(record.accountId!==accountId||!eventIds.has(record.eventId)||record.note?.startsWith('event-update:'))return false
    if(record.journal?.timePrecision==='unknown'||record.caseContext?.timeUnknown||record.aiProvenance?.time?.precision==='unknown'||['pending','external_ai'].includes(record.caseContext?.identity??''))return false
    // The journal projection resolves legacy precision before reaching here.
    const at=record.journal?.occurredAt??record.occurredAt,instant=new Date(at)
    if(!Number.isFinite(instant.getTime())||instant>now)return false
    const day=dayAt(instant);return day>=start&&day<=end
  })
  if(!effective)throw fail('这个范围还没有可形成回顾的已确认记录，原券仍保留','REVIEW_NO_CONFIRMED_RECORDS')
  return {version:1,timeZone:zone,memberName:member.name??'',capturedAt:now.toISOString(),sources:{index,cases,profiles,reminders}}
}
