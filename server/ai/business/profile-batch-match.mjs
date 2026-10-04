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
// OCR/extraction can return one candidate per page. Fold complementary facts
// using clinical event identity, not a model-selected relationKey. Different
// doses, dates and conflicting original fields stay separate.
export function mergeProfileItems(items,timezone='Asia/Shanghai'){
  const result=[]
  for(const original of items){
    const item=structuredClone(original),vaccine=item.journal?.vaccination?.items?.[0]
    const day=item.time?.resolvedStart&&item.time.precision!=='unknown'?date(item.time.resolvedStart,timezone):null
    const matches=result.filter(prior=>{
      if(item.category!=='vaccination'||prior.category!=='vaccination'||!day||!vaccine||item.journal.vaccination.items.length!==1)return false
      if(!prior.time?.resolvedStart||date(prior.time.resolvedStart,timezone)!==day||prior.archiveCategory!==item.archiveCategory||prior.journal?.vaccination?.items?.length!==1||!vaccineEqual(vaccine,prior.journal.vaccination.items[0]))return false
      return !item.fields.some(field=>field.name!=='doseOriginal'&&prior.fields.some(p=>p.name===field.name&&p.value!==field.value))
    })
    const match=matches.length===1?matches[0]:null
    if(!match){result.push(item);continue}
    for(const field of item.fields){
      const existing=match.fields.find(f=>f.name===field.name)
      if(!existing)match.fields.push(field)
      else if(existing.value===field.value)existing.sources=[...new Map([...(existing.sources??[]),...(field.sources??[])].map(s=>[JSON.stringify(s),s])).values()]
      // Equivalent raw dose wording is not rewritten. Full page text and its
      // original dose remain available in the batch's attached originals.
    }
  }
  return result
}
