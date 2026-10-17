// Isolated E2E provider responses. Never imported by application runtime.
const parseInput=body=>typeof body.input==='string'?JSON.parse(body.input.split('\n\n').at(-1)):body.input

export function nurseFixtureOutput(body){
  const turns=parseInput(body),user=turns.filter(t=>t.role==='user').at(-1)
  const first=turns.find(t=>t.role==='user'&&t.text.includes('脸颊'))??user
  const organized={reply:'有没有影响睡眠？',intent:user.text.includes('整理')?'organize':'continue',emergency:{currentChild:false,quote:''},fields:{narrative:'脸颊发红发痒，没有发热。',timeText:'',locationText:'脸颊',impactLevel:'',triggerText:'',trend:''},fieldEvidence:[{field:'narrative',sourceTurnId:first.id,quote:first.text.split('。')[0]},{field:'locationText',sourceTurnId:first.id,quote:first.text.split('。')[0]}],notes:[{category:'parent_concern',heading:'家长担心',text:'担心鸡蛋相关，尚未确认。',sourceTurnId:first.id,quote:first.text,certainty:'uncertain',attribution:'parent'},{category:'prior_action',heading:'已做处理',text:'涂过保湿霜，效果不确定。',sourceTurnId:first.id,quote:first.text,certainty:'uncertain',attribution:'parent'}]}
  const properties=body.text.format.schema.properties
  if(properties.concernCoverage)organized.concernCoverage=Object.fromEntries(Object.entries(properties.concernCoverage.properties).map(([id,rule])=>[id,rule.enum.includes('')?'':rule.enum[0]]))
  if(properties.symptomObservations)organized.symptomObservations=Object.fromEntries(Object.entries(properties.symptomObservations.properties).map(([id])=>[id,id===first.id?first.text.split('。')[0]:'']))
  // All three tasks share the format name. Only organization requests fields
  // and notes; chat and assessment must satisfy their smaller strict schema.
  return Object.fromEntries(Object.keys(properties).filter(key=>Object.hasOwn(organized,key)).map(key=>[key,organized[key]]))
}

export const isCurrentSituationTransport=body=>Boolean(body.text?.format?.schema?.properties?.currentSituation?.properties?.description?.items?.properties?.from)

function passageDocuments(body){
  return parseInput(body).map(({passages})=>{
    let offset=0
    return {text:passages.map(p=>p.text).join(''),passages:passages.map(p=>{const start=offset;offset+=p.text.length;return {...p,start,end:offset}})}
  })
}

export function currentSituationFixtureOutput(body,override){
  const documents=passageDocuments(body)
  if(override!==null&&override!==undefined){
    // Legacy full-summary or malformed injections remain malformed for this
    // request. Do not replace a deliberately invalid response with success.
    if(!override.currentSituation||typeof override.currentSituation!=='object')return structuredClone(override)
    const refs=quote=>{
      if(typeof quote!=='string'||!quote)return {from:'p999999',through:'p999999'}
      const matches=documents.map(document=>({document,start:document.text.indexOf(quote)})).filter(match=>match.start>=0)
      // Ambiguous or absent evidence stays invalid, rather than being guessed.
      if(matches.length!==1)return {from:'p999999',through:'p999999'}
      const {document,start}=matches[0],end=start+quote.length,covered=document.passages.filter(p=>p.start<end&&p.end>start)
      return {from:covered[0]?.id??'p999999',through:covered.at(-1)?.id??'p999999'}
    }
    return {...structuredClone(override),currentSituation:Object.fromEntries(Object.entries(override.currentSituation).map(([key,rows])=>[key,Array.isArray(rows)?rows.map(row=>{
      // Native transport fixtures pass through unchanged, including unknown
      // ranges, bad numbers or extra fields used by rejection tests.
      if(!row||typeof row!=='object'||Object.hasOwn(row,'from')||Object.hasOwn(row,'through'))return structuredClone(row)
      const {sourceId,quote,noteQuote,...line}=structuredClone(row)
      const result={...line,...refs(quote)}
      if(key==='symptoms'){const note=row.note?refs(noteQuote):{from:'',through:''};result.noteFrom=note.from;result.noteThrough=note.through}
      return result
    }):structuredClone(rows)]))}
  }
  const line=document=>({text:document.text.trim(),from:document.passages[0].id,through:document.passages.at(-1).id,emphasis:[]})
  const selected=documents.filter(d=>d.text.trim()).slice(0,6)
  // Default synthetic records are short known observations. Returning their
  // actual source text keeps the runtime evidence validator authoritative.
  return {currentSituation:{description:selected.map(line),symptoms:selected.map(document=>({...line(document),label:/体温|温度|℃/.test(document.text)?'体温':'症状',kind:/体温|温度|℃/.test(document.text)?'temperature':'symptom',note:'',noteFrom:'',noteThrough:''})),diet:[],changes:[],treatment:[],keywords:[]}}
}
