/** Conversation timestamps describe messages, never the occurrence of health facts. */
export function conversationTime(value?:number|string) {
  const at=typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN
  if(!Number.isFinite(at))return null
  const date=new Date(at)
  return {at,iso:date.toISOString(),label:new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date),day:new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
}
export function showConversationTime(at?:number|string,previous?:number|string) {
  const current=conversationTime(at),before=conversationTime(previous)
  return Boolean(current&&(!before||current.day!==before.day||current.at-before.at>=5*60*1000))
}
