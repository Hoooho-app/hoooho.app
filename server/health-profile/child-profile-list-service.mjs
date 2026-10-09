import { ProfileSectionStore } from './profile-section-store.mjs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {JsonStore} from '../auth/storage/json-store.mjs'
import {accountTransaction} from '../auth/storage/transaction.mjs'
import {HealthEventService} from '../events/health-event-service.mjs'
import {HealthEventRecordRepository} from '../events/repositories/health-event-record-repository.mjs'
import {validateJournal} from '../events/journal-metadata.mjs'

export const profileGroups={allergy:['食物','药物','动物','环境','接触物'],chronic:['呼吸道','皮肤','消化','其他'],'family-history':['父亲','母亲','祖父','祖母'],surgery:[],vaccination:['1岁内','1岁','2岁','3岁','4岁','5岁','6岁']}
export const profileFrequencies=['每天','每周','每月','每季度','每年']
const allergyGroups={food:'食物',drug:'药物',animal:'动物',insect:'动物',environment:'环境',contact:'接触物'}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const norm=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
const text=value=>typeof value==='string'?value.trim():''
const own=(r,m)=>!r.memberId||r.memberId===m
export class ProfileListError extends Error{constructor(message,status=400,code='INVALID_PROFILE_LIST'){super(message);this.status=status;this.code=code}}
const fail=(message,status,code)=>{throw new ProfileListError(message,status,code)}
export function calendarDay(value){return value?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):''}
export function validDay(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value}
export function vaccinationAgeGroup(birthday,date,fallback=''){
  if(!date)return profileGroups.vaccination.includes(fallback)?fallback:'年龄待确认'
  if(!validDay(birthday)||!validDay(date)||date<birthday)return '年龄待确认'
  let age=Number(date.slice(0,4))-Number(birthday.slice(0,4));if(date.slice(5)<birthday.slice(5))age--
  return age<1?'1岁内':age<=6?`${age}岁`:'7岁及以上'
}
const confirmed=r=>['confirmed','已明确','医生明确'].includes(r.currentStatus??r.certainty)
const relationship=r=>text(r.relationship==='其他'?r.customRelationship||r.relationship:r.relationship)||'亲属关系待确认'
const relationId=name=>`relation:${hash(name).slice(0,24)}`
const legacyId=(kind,i)=>`legacy-${kind}-${i+1}`

// This is a projection/command adapter over existing sections and vaccination
// journals. State stores relation identities, undo snapshots and request keys,
// never a second collection of health or vaccination records.
export class ChildProfileListService{
  constructor({dataDirectory,now=()=>new Date()}){
    this.directory=dataDirectory;this.now=now;this.events=new HealthEventService({dataDirectory})
    this.records=new HealthEventRecordRepository(dataDirectory)
    this.sections=new ProfileSectionStore(dataDirectory)
    this.state=new JsonStore(path.join(dataDirectory,'child-profile-list-state.json'),{members:[],requests:[]})
  }
  async context(accountId,memberId,kind){
    if(!Object.hasOwn(profileGroups,kind))fail('档案类别不存在',404)
    const member=await this.events.assertMemberOwnership(accountId,memberId)
    const section=(await this.sections.read()).sections.find(s=>s.accountId===accountId&&s.memberId===memberId&&s.sectionId===kind)
    const stored=await this.state.read(),data={...stored,members:stored.members??[],requests:stored.requests??[]},state=structuredClone(data.members.find(s=>s.accountId===accountId&&s.memberId===memberId)??{accountId,memberId,relations:[],undo:[]})
    return {member,section,state,data}
  }
  async project(accountId,memberId,kind,context){
    const c=context??await this.context(accountId,memberId,kind),rows=[],targets=new Map(),pending=[],unknown=[]
    const relations=profileGroups['family-history'].map(name=>({id:relationId(name),name,default:true}))
    for(const relation of c.state.relations??[])if(!relations.some(r=>r.id===relation.id))relations.push(relation)
    const add=(row,target,raw)=>{if(Array.isArray(raw)?raw.some(v=>v?.profileListDeletedAt):raw?.profileListDeletedAt)return;rows.push({...row,version:hash(raw)});targets.set(row.id,target)}
    for(const [index,outer] of (c.section?.records??[]).entries()){
      if(!outer||typeof outer!=='object'||!own(outer,memberId)||outer.recordType==='allergy-report')continue
      const sources=kind==='allergy'&&outer._allergyArchive?.items?outer._allergyArchive.items:[outer]
      for(const [nested,r] of sources.entries()){
        if(!own(r,memberId)||r.profileListDeletedAt)continue
        const id=r.id??(outer===r?legacyId(kind,index):`${legacyId(kind,index)}:item-${nested+1}`),name=text(r.name??r.subject)
        const base={id,name,group:'',frequency:text(r.frequency),date:''}
        const target={outer,index,nested:outer===r?null:nested,raw:r}
        if(kind==='allergy'){
          if(!name)continue
          if(!confirmed(r)){if(!['excluded','tolerated','已排除','曾经有，目前已耐受'].includes(r.currentStatus??r.certainty))pending.push({id,name,group:allergyGroups[r.category]??'类别待确认'});continue}
          const group=allergyGroups[r.category]??(profileGroups.allergy.includes(r.category)?r.category:profileGroups.allergy.includes(r.type)?r.type:null)
          if(!group){unknown.push(id);continue}add({...base,group},target,r)
        }else if(kind==='family-history'){
          const label=relationship(r),rid=r.relationId??relationId(label)
          if(!relations.some(v=>v.id===rid))relations.push({id:rid,name:label,default:false})
          const issues=Array.isArray(r.healthIssues)?r.healthIssues:[{id:`${id}:legacy`,name:r.disease??r.conditions??r.name??'',onset:r.onset??r.age,certainty:r.certainty}]
          for(const [i,issue] of issues.entries())if(text(issue.name))add({...base,id:`${id}/${issue.id??`issue-${i+1}`}`,name:text(issue.name),group:rid},{...target,issueIndex:i,issue},[r,issue])
        }else if(kind==='vaccination'){
          if(name)add({...base,date:text(r.date??r.vaccinationDate),group:vaccinationAgeGroup(c.member.birthday,text(r.date??r.vaccinationDate),r.profileAgeGroup)},{...target,legacy:true},r)
        }else if(name)add({...base,group:kind==='chronic'?(profileGroups.chronic.includes(r.profileCategory)?r.profileCategory:profileGroups.chronic.includes(r.category)?r.category:'其他'):''},target,r)
      }
    }
    if(kind==='vaccination'){
      const ids=new Set((await this.events.repository.findByAccountId(accountId)).filter(e=>e.memberId===memberId).map(e=>e.id))
      const records=(await this.records.findByAccountId(accountId)).filter(r=>ids.has(r.eventId)).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))
      for(const record of records)for(const [i,v] of (record.journal?.vaccination?.items??[]).entries()){
        const date=Object.hasOwn(v,'administeredOn')?v.administeredOn:record.journal.timePrecision==='unknown'?'':calendarDay(record.occurredAt)
        const suffix={dose_1:'第1剂',dose_2:'第2剂',dose_3:'第3剂',dose_4:'第4剂',booster:'加强剂'}[v.doseSequence]
        add({id:`${record.id}/${v.id}`,name:v.vaccineName,displayName:suffix?`${v.vaccineName}（${suffix}）`:v.vaccineName,group:vaccinationAgeGroup(c.member.birthday,date,v.profileAgeGroup),date,frequency:''},{record,itemIndex:i,raw:v},[record,v])
      }
    }
    if(kind==='surgery')rows.sort((a,b)=>{const x=targets.get(a.id),y=targets.get(b.id);return (x.raw.sequence>0?x.raw.sequence:x.index+1)-(y.raw.sequence>0?y.raw.sequence:y.index+1)})
    return {rows,pendingAllergyRows:pending,groups:kind==='family-history'?relations.map(r=>({id:r.id,name:r.name})):profileGroups[kind].map(name=>({id:name,name})),compatibility:{pendingAllergies:pending.length,confirmedUnknownCategory:unknown.length,unknownVaccineAge:rows.filter(r=>r.group==='年龄待确认').length,olderVaccineAge:rows.filter(r=>r.group==='7岁及以上').length},targets,context:c}
  }
  async list(a,m,k){const {targets,context,...result}=await this.project(a,m,k);return result}
  async command(accountId,memberId,kind,input){return accountTransaction(this.directory,async()=>{
    const c=await this.context(accountId,memberId,kind),key=text(input.key)
    if(!key||key.length>120)fail('缺少保存标识')
    const prior=c.data.requests.find(r=>r.accountId===accountId&&r.key===key)
    if(prior){if(prior.memberId!==memberId||prior.kind!==kind)fail('保存标识不属于当前孩子',409);return {...await this.list(accountId,memberId,kind),notice:prior.notice,undoId:prior.undoId}}
    const p=await this.project(accountId,memberId,kind,c),now=this.now(),timestamp=now.toISOString(),records=structuredClone(c.section?.records??[])
    let notice='已保存',undoId,sectionChanged=false
    const row=p.rows.find(r=>r.id===input.id),target=p.targets.get(input.id)
    if(['edit','delete'].includes(input.action)&&(!target||row.version!==input.version))fail('记录已更新，请重新加载后核对；草稿仍保留',409,'PROFILE_LIST_CONFLICT')
    const name=text(input.name);if(['add','edit'].includes(input.action)&&(!name||name.length>200))fail('请填写名称或一句描述（最多200字）')
    let group=input.group
    if(kind==='family-history'&&['add','edit'].includes(input.action)&&!p.groups.some(g=>g.id===group))fail('请先添加亲属关系')
    if(kind!=='family-history'&&kind!=='surgery'&&['add','edit'].includes(input.action)&&!profileGroups[kind].includes(group)&&!(kind==='vaccination'&&['年龄待确认','7岁及以上'].includes(group)))fail('分类无效')
    if(kind==='chronic'&&Object.hasOwn(input,'frequency')&&input.frequency!==''&&!profileFrequencies.includes(input.frequency))fail('出现频率无效')
    if(kind==='vaccination'&&Object.hasOwn(input,'date')&&input.date!==''&&(!validDay(input.date)||input.date>calendarDay(now)))fail('请填写有效且不晚于今天的接种日期')
    if(['add','edit'].includes(input.action)&&!['surgery','vaccination'].includes(kind)&&p.rows.some(r=>r.id!==input.id&&r.group===group&&norm(r.name)===norm(name)))fail('当前分类已有这条记录',409,'PROFILE_LIST_DUPLICATE')
    const updateTarget=async(changes)=>{
      if(target.record){
        const record=target.record,journal=structuredClone(record.journal);Object.assign(journal.vaccination.items[target.itemIndex],changes)
        validateJournal(journal);await this.records.update(record.id,{journal},now)
      }else{
        const current=records[target.index];current.id??=legacyId(kind,target.index);if(target.issueIndex!==undefined){
          if(!Array.isArray(current.healthIssues))current.healthIssues=[structuredClone(target.issue)]
          Object.assign(current.healthIssues[target.issueIndex],changes)
          current.id??=target.raw.id??legacyId(kind,target.index);current.healthIssues[target.issueIndex].id??=`issue-${target.issueIndex+1}`
        }else if(target.nested!==null)Object.assign(current._allergyArchive.items[target.nested],changes,{id:target.raw.id??input.id})
        else Object.assign(current,changes,{id:current.id??legacyId(kind,target.index)})
        sectionChanged=true
      }
    }
    if(input.action==='relation'){
      if(kind!=='family-history'||!name||name.length>20)fail('请填写亲属关系（最多20字）')
      if(p.groups.some(g=>norm(g.name)===norm(name)))fail('这个亲属关系已经存在',409)
      c.state.relations.push({id:randomUUID(),name,default:false});notice='亲属关系已添加'
    }else if(input.action==='delete'){
      undoId=randomUUID();c.state.undo.push({id:undoId,kind,rowId:input.id,target:structuredClone(target),createdAt:timestamp})
      await updateTarget({profileListDeletedAt:timestamp});notice='已删除，可撤销'
    }else if(input.action==='restore'){
      const undo=c.state.undo.find(v=>v.id===input.undoId&&v.kind===kind);if(!undo)fail('这条记录无法撤销，请重新加载',409)
      if(undo.target.record){const r=await this.records.findById(undo.target.record.id);if(!r||r.accountId!==accountId)fail('记录已不存在',409);const journal=structuredClone(r.journal),v=journal.vaccination.items.find(v=>v.id===undo.target.raw.id);if(!v)fail('记录已变更，无法直接撤销',409);delete v.profileListDeletedAt;await this.records.update(r.id,{journal},now)}
      else {
        const t=undo.target,outerId=t.outer.id??legacyId(kind,t.index)
        let r=records.find(v=>v.id===outerId)
        // Legacy serializers may omit a hidden record. Recover only its saved
        // identity, never whichever unrelated row now occupies its old index.
        if(!r){r={...structuredClone(t.outer),id:outerId};records.push(r)}
        let destination=r
        if(t.issueIndex!==undefined){
          const issueId=t.issue.id??`issue-${t.issueIndex+1}`
          r.healthIssues??=[{...structuredClone(t.issue),id:issueId}]
          r.healthIssues=r.healthIssues.map((v,i)=>({...v,id:v.id??`issue-${i+1}`}))
          destination=r.healthIssues.find(v=>v.id===issueId)
          if(!destination){destination={...structuredClone(t.issue),id:issueId};r.healthIssues.push(destination)}
        }else if(t.nested!==null){
          destination=r._allergyArchive?.items.find(v=>v.id===(t.raw.id??undo.rowId))
          if(!destination&&r._allergyArchive?.items[t.nested]&&hash(r._allergyArchive.items[t.nested])===hash(t.raw)){destination=r._allergyArchive.items[t.nested];destination.id=t.raw.id??undo.rowId}
          if(!destination)fail('记录已变更，无法直接撤销',409)
        }
        delete destination.profileListDeletedAt;sectionChanged=true
      }
      c.state.undo=c.state.undo.filter(v=>v!==undo);notice='已恢复'
    }else if(['add','edit'].includes(input.action)){
      if(input.action==='edit'){
        const changes=kind==='vaccination'&&target.record?{vaccineName:name}:{name}
        if(kind==='chronic'&&Object.hasOwn(input,'frequency'))changes.frequency=input.frequency
        if(kind==='vaccination'&&Object.hasOwn(input,'date')){
          Object.assign(changes,target.record?{administeredOn:input.date,profileAgeGroup:profileGroups.vaccination.includes(group)?group:target.raw.profileAgeGroup}:{date:input.date,profileAgeGroup:profileGroups.vaccination.includes(group)?group:target.raw.profileAgeGroup})
          const nextGroup=vaccinationAgeGroup(c.member.birthday,input.date,changes.profileAgeGroup);if(nextGroup!==row.group)notice=`已保存，记录移到${nextGroup}`
        }
        await updateTarget(changes)
      }else if(kind==='vaccination'){
        const date=input.date??'',occurredAt=date?`${date}T00:00:00+08:00`:timestamp
        const event=await this.events.create(accountId,{memberId,title:'疫苗接种记录',category:'other',startTime:occurredAt},now)
        const journal=validateJournal({categories:['vaccination'],timePrecision:date?'exact':'unknown',vaccination:{items:[{id:randomUUID(),vaccineName:name,doseSequence:'unknown',administeredOn:date,profileAgeGroup:group}]}})
        await this.records.create({accountId,eventId:event.id,type:'note',content:name,occurredAt,sourceType:'text_record',sourceText:name,journal},now)
      }else{
        const common={id:randomUUID(),name,accountId,memberId,_savedAt:timestamp}
        if(kind==='allergy')Object.assign(common,{category:Object.keys(allergyGroups).find(k=>allergyGroups[k]===group),currentStatus:'confirmed',sourceType:'caregiver',sourceLabel:'家长明确填写',createdAt:timestamp,updatedAt:timestamp,history:[{id:randomUUID(),status:'confirmed',label:'用户明确录入',sourceType:'caregiver',occurredAt:timestamp}],reactions:[],tests:[],sourceReferences:[],ingredientRelations:[],evidenceLinks:[]})
        if(kind==='chronic')Object.assign(common,{profileCategory:group,frequency:input.frequency??''})
        if(kind==='surgery')common.sequence=Math.max(0,...records.map((r,i)=>r.sequence>0?r.sequence:i+1))+1
        if(kind==='family-history')Object.assign(common,{relationship:p.groups.find(r=>r.id===group).name,relationId:group,healthIssues:[{id:randomUUID(),name}]})
        records.push(common);sectionChanged=true
      }
    }else fail('操作不支持')
    if(sectionChanged)await this.sections.update(data=>({...data,sections:[...data.sections.filter(s=>!(s.accountId===accountId&&s.memberId===memberId&&s.sectionId===kind)),{...c.section,accountId,memberId,sectionId:kind,records,revision:(c.section?.revision??0)+1}]}))
    await this.state.update(data=>({...data,members:[...(data.members??[]).filter(s=>!(s.accountId===accountId&&s.memberId===memberId)),c.state],requests:[...(data.requests??[]),{accountId,memberId,kind,key,notice,undoId}]}))
    return {...await this.list(accountId,memberId,kind),notice,undoId}
  })}
}
