const anchors=new Set(['symptom','injury'])
const continuations=new Set(['visit','examination','other','care','activity'])
const clinicalFields=new Set(['doctorStatement','followUp','conclusion','result','institution','department','chiefComplaint','handling','statusRaw','reportType'])
const medical=/医生|大夫|医师|医院|就医|就诊|门诊|急诊/u
const upload=/^(?:上传|补充|提供|附上|查看|这[张些份]).{0,10}(?:资料|照片|图片|附件|报告)(?:记录)?$/u
const separate=/另外(?:一件|一个|还)|另一(?:件|个|次)|分别|互不相关|无关/u
const refs=item=>item.fields.flatMap(f=>f.sources??[])
const fromParent=item=>refs(item).length>0&&refs(item).every(s=>s.sourceId==='input')
const isAnchor=item=>anchors.has(item.category)&&item.fields.some(f=>f.name==='symptom')&&!item.archiveCategory
function continuation(item){
  return continuations.has(item.category)&&!item.archiveCategory&&item.fields.length>0&&item.fields.every(f=>clinicalFields.has(f.name)||upload.test(f.value))
}
function compatibleTime(a,b,{resolve,referenceNow,timezone='Asia/Shanghai'}){
  const left=resolve(a),right=resolve(b)
  const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:timezone}).format(new Date(value))
  if(a.timeText&&b.timeText&&(!left?.resolvedStart||!right?.resolvedStart))return a.timeText===b.timeText
  if(left?.resolvedStart&&right?.resolvedStart){
    if(left.precision==='exact'&&right.precision==='exact')return left.resolvedStart===right.resolvedStart
    return day(left.resolvedStart)===day(right.resolvedStart)
  }
  // An undated live narration cannot adopt a historical fragment's date.
  const known=left?.resolvedStart??right?.resolvedStart
  if(known)return referenceNow&&day(known)===day(referenceNow)
  return !a.timeText&&!b.timeText||a.timeText===b.timeText
}

/** Merge only grounded continuations of one clinical occurrence, never a whole
 * conversation. Fields, qualifiers and source references remain untouched. */
export function mergeNarratedIncidents(items,sources,options){
  const result=structuredClone(items)
  for(const item of result){
    if(!item.fields.some(f=>f.name==='followUp'))item.fields=item.fields.map(f=>['doctorStatement','conclusion','result'].includes(f.name)&&/(?:需要|需|继续|注意|留意|定期|再|要).{0,6}(?:观察|复查|随访)/u.test(f.value)?{...f,name:'followUp',nameResolution:{original:f.name,source:'explicit_followup_statement'}}:f)
  }
  const primary=result.filter(isAnchor)
  const input=sources.find(s=>s.id==='input')?.text??''
  for(const item of [...result]){
    if(!continuation(item))continue
    const clinicianEvidence=item.fields.some(f=>medical.test(f.value)||(f.sources??[]).some(ref=>{
      if(medical.test(ref.quote))return true
      const source=sources.find(s=>s.id===ref.sourceId&&s.page===ref.page||s.id===ref.sourceId&&s.page===undefined)
      if(!source||source.text.indexOf(ref.quote)!==source.text.lastIndexOf(ref.quote))return false
      const at=source.text.indexOf(ref.quote)
      return at>=0&&medical.test(source.text.slice(Math.max(0,at-16),at).split(/[。；;\n]/u).at(-1))
    }))
    const related=primary.filter(anchor=>{
      if(!compatibleTime(anchor,item,options))return false
      if(anchor.relationKey&&item.relationKey&&anchor.relationKey!==item.relationKey)return false
      const explicitlyRelated=Boolean(anchor.relationKey&&anchor.relationKey===item.relationKey)
      // A shared model key is still bounded by verified parent evidence. Files
      // with independent dates/results remain their own records.
      if(!fromParent(anchor)||!fromParent(item))return false
      if(item.fields.some(f=>f.name==='result')&&!clinicianEvidence&&!explicitlyRelated)return false
      return explicitlyRelated||primary.length===1&&medical.test(input)&&!separate.test(input)&&(clinicianEvidence||item.fields.some(f=>['doctorStatement','followUp'].includes(f.name))||item.fields.every(f=>upload.test(f.value)))
    })
    if(related.length!==1)continue
    const anchor=related[0]
    // Upload is an operation, not another health fact. The complete source text
    // and binary originals are retained by the draft/save boundary.
    const healthFields=item.fields.filter(f=>!upload.test(f.value))
    // The review editor addresses fields by name. Conflicting values remain
    // separate records instead of silently replacing a fact during editing.
    if(healthFields.some(f=>anchor.fields.some(old=>old.name===f.name&&old.value!==f.value)))continue
    for(const field of healthFields){
      const existing=anchor.fields.find(f=>f.name===field.name&&f.value===field.value)
      if(existing)existing.sources=[...new Map([...existing.sources,...field.sources].map(s=>[JSON.stringify(s),s])).values()]
      else anchor.fields.push(field)
    }
    anchor.mergedIds=[...(anchor.mergedIds??[]),item.id,...(item.mergedIds??[])]
    result.splice(result.indexOf(item),1)
  }
  return result
}
