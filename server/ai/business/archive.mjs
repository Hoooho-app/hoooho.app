import { randomUUID } from 'node:crypto'
import fieldLabels from '../../../shared/ai-business-field-labels.json' with {type:'json'}
const value=(item,name)=>item.fields.find(f=>f.name===name)?.value??''
// These are adapters to the established profile sections, not a parallel
// model-owned medical chart. Original statements and confirmed records remain.
export function archiveItem(sections,item,{accountId,memberId,eventId,recordId,attachmentIds,now,profileBatch=false}){
  let category=item.archiveCategory
  if(!category&&value(item,'allergen'))category='allergy'
  if(!category)return sections
  // There is no generic medical-history section. Keep unmatched history in its
  // source record rather than falsely classifying it as an admission or chronic disease.
  if(['medical-history','important'].includes(category))return sections
  // Vaccines stay in the existing journal, not a second profile database.
  if(category==='vaccination')return sections
  if(['chronic','surgery','family-history'].includes(category)&&!value(item,'historyName'))return sections
  if(category==='family-history'&&!value(item,'relationship'))return sections
  const sectionId=category
  const existing=sections.find(s=>s.accountId===accountId&&s.memberId===memberId&&s.sectionId===sectionId)
  if(existing?.records.some(r=>r.sourceRecordId===recordId||r.sourceReferences?.some(ref=>ref.id===`ai:${recordId}`)))return sections
  const records=structuredClone(existing?.records??[]),timestamp=now.toISOString()
  if(profileBatch){
    const name=value(item,'allergen')||value(item,'historyName')||item.title
    const related=records.filter(r=>r.name===name&&(sectionId!=='family-history'||r.relationship===value(item,'relationship')))
    if(related.length){
      const day=item.time?.resolvedStart?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(item.time.resolvedStart)):''
      const hospital=value(item,'institution'),reaction=value(item,'reaction')||value(item,'symptom')
      const reliable=related.filter(r=>day&&(r.date===day||r.firstFoundAt===day||r.reactions?.some(x=>x.occurredAt===item.time.resolvedStart&&reaction&&x.symptoms===reaction))&&(hospital&&(r.hospital===hospital||r.organization===hospital)||reaction&&r.reactions?.some(x=>x.symptoms===reaction)))
      if(reliable.length!==1)return sections // Retain the source record, never guess an association by name.
      const current=reliable[0]
      current.attachmentIds=[...new Set([...(current.attachmentIds??[]),...attachmentIds])]
      current.sourceReferences=[...(current.sourceReferences??[]),{id:`ai:${recordId}`,sourceId:eventId,recordIds:[recordId],occurredAt:item.time?.resolvedStart??'',attachmentIds}]
      return [...sections.filter(s=>s!==existing),{...existing,records,revision:(existing.revision??0)+1}]
    }
  }
  if(sectionId==='allergy'){
    const allergen=value(item,'allergen')||'尚未明确',current=records.find(r=>r.name===allergen&&r.memberId===memberId),id=current?.id??randomUUID()
    const statement=value(item,'allergyStatus'),doctor=value(item,'doctorStatement')
    // A laboratory positive alone is never a confirmed clinical allergy.
    const status=doctor&&/明确|确诊/.test(statement)&&!/疑似|排除|不确定|未/.test(statement)?'confirmed':'investigating'
    const sourceType=item.category==='examination'?'report':doctor?'clinician':'journal'
    const reference={id:`ai:${recordId}`,type:sourceType,sourceId:eventId,recordIds:[recordId],label:sourceType==='report'?'已核对检查资料':sourceType==='clinician'?'医生原话':'已核对随记',occurredAt:item.time?.resolvedStart??'',active:true,createdAt:timestamp}
    const reaction=value(item,'reaction')||value(item,'symptom')
    const testName=value(item,'testName'),result=value(item,'result')
    const next={...current,id,accountId,memberId,category:current?.category??(value(item,'food')?'food':'unknown'),name:allergen,customName:current?.customName??allergen,currentStatus:current?.currentStatus??status,sourceType:current?.sourceType||sourceType,sourceLabel:current?.sourceLabel||reference.label,dietaryAction:current?.dietaryAction??'',ingredientRelations:current?.ingredientRelations??[],history:[...(current?.history??[]),{id:randomUUID(),status,label:'核对原文后归档',sourceType,sourceId:recordId,occurredAt:item.time?.resolvedStart??''}],createdAt:current?.createdAt??timestamp,updatedAt:timestamp,sourceReferences:[...(current?.sourceReferences??[]).filter(r=>r.id!==reference.id),reference],evidenceLinks:[...(current?.evidenceLinks??[]),{id:`evidence:${recordId}`,allergyItemId:id,healthEventId:eventId,healthRecordId:recordId,relationType:'manual',confidence:1,source:'manual',confirmedByUser:true,createdAt:timestamp}],reactions:[...(current?.reactions??[]),...(reaction?[{id:`reaction:${recordId}`,allergyItemId:id,memberId,linkedHealthEventId:eventId,linkedHealthRecordId:recordId,symptomSystems:[],symptoms:reaction,exposureAmount:value(item,'amount'),latency:'',bodyLocations:value(item,'location'),handling:value(item,'handling'),aggravatingFactors:'',relievingFactors:'',occurredAt:item.time?.resolvedStart??'',photos:attachmentIds,notes:'仅原话记录；关联不代表因果'}]:[])],tests:[...(current?.tests??[]),...(testName?[{id:`test:${recordId}`,allergyItemId:id,memberId,reportId:recordId,testType:testName,result:/阴性/.test(result)?'negative':/阳性/.test(result)?'positive':'',value:result,unit:value(item,'unit'),testedAt:item.time?.resolvedStart??'',institution:value(item,'institution'),reportFiles:attachmentIds,clinicianInterpretation:doctor,notes:'不根据检测阳性推断临床确诊'}]:[])]}
    if(current)records.splice(records.indexOf(current),1,next);else records.push(next)
  }else{
    const name=value(item,'historyName')||value(item,'medicationName')||value(item,'testName')||item.title,date=item.time?.resolvedStart?.slice(0,10)??'',note=item.fields.map(f=>`${fieldLabels[f.name]??f.name}：${f.value}`).join('\n')
    const mapped=sectionId==='family-history'?{relationship:value(item,'relationship'),healthIssues:[{id:`issue:${recordId}`,name:value(item,'historyName'),onset:date,certainty:'待确认'}]}:sectionId==='medication'?{dose:value(item,'doseOriginal'),frequency:value(item,'frequency'),route:value(item,'route'),startedAt:date}:sectionId==='chronic'?{knowledge:'待确认',firstFoundAt:date,impact:value(item,'symptom'),management:value(item,'handling')}:sectionId==='surgery'?{hospital:value(item,'institution'),reason:value(item,'chiefComplaint'),recovery:value(item,'handling')}:sectionId==='examination'?{organization:value(item,'institution'),summary:note}:{}
    const addition={id:`ai-archive:${recordId}`,accountId,memberId,name,date,note,...mapped,sourceRecordId:recordId,sourceEventId:eventId,attachmentIds,sourceFields:item.fields,confirmed:true,_savedAt:timestamp}
    if(!records.some(r=>r.id===addition.id))records.push(addition)
  }
  const next={accountId,memberId,sectionId,records,revision:(existing?.revision??0)+1}
  return [...sections.filter(s=>s!==existing),next]
}
