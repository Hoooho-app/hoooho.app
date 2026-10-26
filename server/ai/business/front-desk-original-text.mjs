const references=item=>[...item.fields.flatMap(field=>field.sources??[]),...item.timeSources??[]]
const separators=value=>/^[\p{P}\p{Z}\s]*$/u.test(value)
const userMessage=message=>message?.status==='completed'&&['text','voice','image'].includes(message.kind)&&!message.quoted&&!message.retracted&&typeof message.text==='string'

/** Preserve original punctuation only when selected literal clauses cover the
 * whole scoped message. Never pull omitted words or another person's clause
 * into a record, and never reconstruct a sentence by rewriting source words. */
export function frontDeskOriginalText(item,{sources=[],messages=[],accountId,memberId,contextId}={}){
 const refs=references(item),groups=new Map(),fallback=new Map()
 for(const ref of refs){
  const source=sources.find(source=>source.id===ref.sourceId&&source.page===ref.page)
  const ids=[...new Set((source?.originalReferences??[]).map(original=>original.messageId))]
  const message=ids.length===1?messages.find(message=>message.id===ids[0]&&message.accountId===accountId&&message.memberId===memberId&&message.contextId===contextId&&userMessage(message)):null
  const literal=source?.text
  const at=typeof literal==='string'&&literal?message?.text.indexOf(literal)??-1:-1
  if(!message||at<0||at!==message.text.lastIndexOf(literal)){
   if(typeof ref.quote==='string'&&ref.quote)fallback.set(JSON.stringify([ref.sourceId,ref.page,ref.quote]),ref.quote)
   continue
  }
  if(!groups.has(message.id))groups.set(message.id,{message,ranges:[],literals:[]})
  const group=groups.get(message.id)
  group.ranges.push({start:at,end:at+literal.length});group.literals.push(literal)
 }
 const parts=[...groups.values()].sort((a,b)=>(a.message.inputAt??Date.parse(a.message.at))-(b.message.inputAt??Date.parse(b.message.at))||a.message.id.localeCompare(b.message.id)).flatMap(group=>{
  const ranges=group.ranges.sort((a,b)=>a.start-b.start||a.end-b.end)
  let end=0,complete=true
  for(const range of ranges){if(range.start>end&&!separators(group.message.text.slice(end,range.start)))complete=false;end=Math.max(end,range.end)}
  if(!separators(group.message.text.slice(end)))complete=false
  return complete?[group.message.text]:[...new Set(group.literals)]
 })
 return [...parts,...fallback.values()].join('\n')
}
