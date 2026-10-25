import {createHash} from 'node:crypto'

// Evidence binding only. Call the existing clinical extraction validator after
// decode(); this module never changes field values or approves clinical facts.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key)
const oldReferenceKeys=['sourceId','page','quote']
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const invalid=(reason,path='/items')=>Object.assign(new Error('来源引用无效，原话仍保留'),{status:422,code:'AI_SOURCE_REFERENCE_INVALID',details:{sourceReference:{reason,path}}})
const ambiguous=path=>Object.assign(new Error('来源片段无法唯一定位，请提供完整上下文'),{status:422,code:'AI_SOURCE_REFERENCE_AMBIGUOUS',details:{sourceReference:{reason:'nonunique_quote',path}}})
const high=code=>code>=0xD800&&code<=0xDBFF
const low=code=>code>=0xDC00&&code<=0xDFFF
const boundary=(text,at)=>!(at>0&&at<text.length&&high(text.charCodeAt(at-1))&&low(text.charCodeAt(at)))

function nextEnd(text,start,limit){
 let hardEnd=Math.min(text.length,start+limit)
 if(!boundary(text,hardEnd))hardEnd--
 if(hardEnd<=start)throw invalid('segment_limit_cannot_hold_code_point','/sources')
 for(let at=start;at<hardEnd;at++){
  const ch=text[at]
  // Keep CRLF together. A too-large CRLF boundary falls back to the hard cut.
  if(ch==='\r'&&text[at+1]==='\n'){
   if(at+2<=hardEnd)return at+2
   continue
  }
  if(/[\n\r。！？!?；;]/u.test(ch))return at+1
  // Do not split decimal numbers, abbreviations or URLs at a bare dot.
  if(ch==='.'&&(at+1===text.length||/\s/u.test(text[at+1])))return at+1
 }
 return hardEnd
}

function isUnique(text,quote,start){
 return text.indexOf(quote)===start&&text.lastIndexOf(quote)===start
}
function uniqueQuote(source,segment,maxLength,path){
 const text=source.text,original=text.slice(segment.start,segment.end)
 if(isUnique(text,original,segment.start))return original
 // Fast, small context expansions keep most repaired quotes narrowly scoped.
 const spare=maxLength-original.length
 const candidates=new Set()
 const tryRange=(start,end)=>{
  if(start<0||end>text.length||start>segment.start||end<segment.end||end-start>maxLength||!boundary(text,start)||!boundary(text,end))return null
  const key=start+':'+end
  if(candidates.has(key))return null
  candidates.add(key)
  const quote=text.slice(start,end)
  return isUnique(text,quote,start)?quote:null
 }
 for(let size=1;size<=spare;size=Math.min(spare,size*2)){
  const ranges=[
   [segment.start,Math.min(text.length,segment.end+size)],
   [Math.max(0,segment.start-size),segment.end],
   [Math.max(0,segment.start-Math.floor(size/2)),Math.min(text.length,segment.end+Math.ceil(size/2))],
  ]
  for(const [start,end] of ranges){const quote=tryRange(start,end);if(quote!==null)return quote}
  if(size===spare)break
 }
 if(text.length<=maxLength){const quote=tryRange(0,text.length);if(quote!==null)return quote}
 // Any unique containing quote can be extended to a unique maximum-size
 // containing window. Enumerating those windows avoids guessing a repetition.
 const length=Math.min(maxLength,text.length)
 const first=Math.max(0,segment.end-length),last=Math.min(segment.start,text.length-length)
 for(let start=first;start<=last;start++){
  let end=start+length
  if(!boundary(text,start))continue
  if(!boundary(text,end))end--
  const quote=tryRange(start,end)
  if(quote!==null)return quote
 }
 throw ambiguous(path)
}

function valueRange(source,segment,value,maxLength,path){
 if(typeof value!=='string'||!value||value.length>maxLength||source.text.slice(segment.start,segment.end).includes(value))return segment
 const matches=[];let present=false
 for(let at=source.text.indexOf(value);at>=0;at=source.text.indexOf(value,at+1)){
  present=true
  const end=at+value.length
  if(at<segment.end&&end>segment.start)matches.push({start:at,end})
  if(matches.length>1)throw ambiguous(path)
 }
 if(matches.length!==1){if(present)throw invalid('value_outside_segment',path);return segment}
 const match=matches[0],start=Math.min(segment.start,match.start),end=Math.max(segment.end,match.end)
 // A long literal may straddle a chunk boundary. The issued segment supplies
 // the anchor; only a unique overlapping literal can widen that binding.
 return end-start<=maxLength?{start,end}:match
}

export function buildSourceReferenceContract(extractionSchema,sources,{segmentLimit=1000,maxQuoteLength=4000,maxSegments=2048}={}){
 if(!Number.isInteger(maxSegments)||maxSegments<1||maxSegments>4096||!Number.isInteger(segmentLimit)||!Number.isInteger(maxQuoteLength)||segmentLimit<1||segmentLimit>maxQuoteLength||maxQuoteLength>4000)throw invalid('invalid_limits','/sources')
 if(!Array.isArray(sources))throw invalid('invalid_sources','/sources')
 // Keep a private snapshot. Caller mutation cannot redirect an issued ID.
 const snapshots=sources.map(source=>{
  if(!object(source)||typeof source.id!=='string'||!source.id.trim()||!Number.isInteger(source.page)||source.page<1||typeof source.text!=='string')throw invalid('invalid_source','/sources')
  return {id:source.id,page:source.page,text:source.text,...(source.sourceKind===undefined?{}:{sourceKind:source.sourceKind}),...(source.status===undefined?{}:{status:source.status})}
 })
 const sourceKeys=new Set()
 for(const source of snapshots){const key=JSON.stringify([source.id,source.page]);if(sourceKeys.has(key))throw invalid('duplicate_source_identity','/sources');sourceKeys.add(key)}
 const schema=structuredClone(extractionSchema)
 const fieldSchema=schema?.properties?.items?.items?.properties?.fields?.items
 if(!object(fieldSchema)||!object(fieldSchema.properties)||!Array.isArray(fieldSchema.required)||oldReferenceKeys.some(key=>!own(fieldSchema.properties,key)))throw invalid('unsupported_extraction_schema','/schema')
 const registry=new Map(),sourceSegments=[]
 for(const source of snapshots){
  const identity=digest({id:source.id,page:source.page,text:source.text,sourceKind:source.sourceKind})
  for(let start=0;start<source.text.length;){
   if(sourceSegments.length>=maxSegments)throw Object.assign(new Error('资料片段过多，请分批整理；原文未截断'),{status:422,code:'AI_SOURCE_LIMIT',details:{sourceReference:{reason:'too_many_segments',path:'/sources'}}})
   const end=nextEnd(source.text,start,segmentLimit),evidenceId='e_'+digest([identity,start,end]).slice(0,32)
   const segment={evidenceId,sourceId:source.id,page:source.page,start,end,text:source.text.slice(start,end),...(source.sourceKind===undefined?{}:{sourceKind:source.sourceKind}),...(source.status===undefined?{}:{status:source.status})}
   if(registry.has(evidenceId))throw invalid('duplicate_evidence_identity','/sources')
   registry.set(evidenceId,{source,segment:{start,end}})
   sourceSegments.push(segment)
   start=end
  }
 }
 if(!sourceSegments.length)throw invalid('no_source_text','/sources')
 for(const key of oldReferenceKeys)delete fieldSchema.properties[key]
 fieldSchema.properties.evidenceId={type:'string',enum:sourceSegments.map(segment=>segment.evidenceId)}
 fieldSchema.required=[...fieldSchema.required.filter(key=>!oldReferenceKeys.includes(key)),'evidenceId']
 fieldSchema.additionalProperties=false
 const boundKeys=new Set(Object.keys(fieldSchema.properties))
 function decode(value,{requireBound=false,omitEmptyFields=false,onEmptyField}={}){
  if(!object(value)||!Array.isArray(value.items))throw invalid('invalid_extraction_output')
  const copy=structuredClone(value)
  let mode=null
  for(const [itemIndex,item] of copy.items.entries()){
   if(!object(item)||!Array.isArray(item.fields))throw invalid('invalid_item_fields',`/items/${itemIndex}/fields`)
   const kept=[]
   for(const [fieldIndex,field] of item.fields.entries()){
    const path=`/items/${itemIndex}/fields/${fieldIndex}`
    if(!object(field))throw invalid('invalid_field',path)
    const bound=own(field,'evidenceId'),legacy=oldReferenceKeys.some(key=>own(field,key))
    if(bound&&legacy)throw invalid('mixed_reference_shape',path)
    const current=bound?'bound':'legacy'
    if(mode&&mode!==current)throw invalid('mixed_reference_shape',path)
    mode=current
    if(!bound){if(requireBound)throw invalid('bound_reference_required',path);kept.push(field);continue} // Legacy literals stay unchanged for an undeclared caller.
    if(typeof field.evidenceId!=='string'||!registry.has(field.evidenceId))throw invalid('unknown_evidence_id',path)
    if(Object.keys(field).some(key=>!boundKeys.has(key)))throw invalid('unexpected_bound_field_property',path)
    if(!fieldSchema.properties.name.enum.includes(field.name)||typeof field.value!=='string')throw invalid('invalid_bound_field',path)
    if(omitEmptyFields&&!field.value.replace(/\p{Cf}/gu,'').trim()){if(typeof onEmptyField==='function')onEmptyField({itemIndex,fieldIndex});continue}
    const {source,segment}=registry.get(field.evidenceId)
    const quote=uniqueQuote(source,valueRange(source,segment,field.value,maxQuoteLength,path),maxQuoteLength,path)
    delete field.evidenceId
    field.sourceId=source.id
    field.page=source.page
    field.quote=quote
    kept.push(field)
   }
   item.fields=kept
  }
  return copy
 }
 // No private full source text is added to model input: use these segments
 // instead of sources[].text, with source metadata supplied separately.
 return {schema,sourceSegments,decode}
}
