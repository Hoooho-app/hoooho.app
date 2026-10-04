const normalized=value=>String(value??'').normalize('NFKC').replace(/\s/g,'').trim()
const date=(value,timezone)=>value?new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):null
const vaccineEqual=(a,b)=>normalized(a.vaccineName)===normalized(b.vaccineName)&&a.doseSequence&&a.doseSequence!=='unknown'&&a.doseSequence===b.doseSequence
// A name is not a record identity. Ambiguous candidates are deliberately unlinked.
export function matchProfileRecord(records,item,timezone='Asia/Shanghai'){
  if(!item.time?.resolvedStart||item.time.precision==='unknown')return null
  const day=date(item.time.resolvedStart,timezone)
  const matches=records.filter(record=>{
    if(record.journal?.timePrecision==='unknown'||date(record.occurredAt,timezone)!==day)return false
    if(item.category==='vaccination'){
      const incoming=item.journal?.vaccination?.items??[],existing=record.journal?.vaccination?.items??[]
      return incoming.length>0&&incoming.every(v=>existing.filter(e=>vaccineEqual(v,e)).length===1)
    }
    const prior=record.aiProvenance
    if(!prior||prior.category!==item.category||prior.archiveCategory!==item.archiveCategory)return false
    const fields=item.fields.filter(f=>f.value),anchors=['institution','relationship','reaction','testName','result','chiefComplaint']
    return fields.some(f=>anchors.includes(f.name))&&fields.length>=2&&fields.every(f=>prior.fields.some(p=>p.name===f.name&&normalized(p.value)===normalized(f.value)))
  })
  return matches.length===1?matches[0]:null
}
export function supplementJournal(existing,incoming){
  const next=structuredClone(existing??{})
  if(!next.vaccination||!incoming?.vaccination)return next
  const vaccine=incoming.vaccination
  for(const key of ['institutionName','note'])if(!next.vaccination[key]&&vaccine[key])next.vaccination[key]=vaccine[key]
  next.vaccination.items=next.vaccination.items.map(current=>{
    const source=vaccine.items.find(i=>vaccineEqual(current,i));if(!source)return current
    return {...current,...Object.fromEntries(['manufacturerName','batchNumber','vaccineCode','commonAbbreviation'].filter(k=>!current[k]&&source[k]).map(k=>[k,source[k]]))}
  })
  return next
}
export function uncertainVaccineAssociation(records,item,timezone='Asia/Shanghai'){
  if(item.category!=='vaccination')return false
  const incoming=item.journal?.vaccination?.items??[],day=item.time?.resolvedStart?date(item.time.resolvedStart,timezone):null
  return records.some(record=>(!day||record.journal?.timePrecision==='unknown'||date(record.occurredAt,timezone)===day)&&record.journal?.vaccination?.items?.some(existing=>incoming.some(v=>normalized(v.vaccineName)===normalized(existing.vaccineName)&&(v.doseSequence==='unknown'||existing.doseSequence==='unknown'||v.doseSequence===existing.doseSequence))))
}
