const fail=message=>Object.assign(new Error(message),{status:400,code:'VISIT_PHOTO_INVALID'})
export function photoDetails(previous, incoming, aliases=new Map(), now=new Date(), timezone='Asia/Shanghai') {
  if(incoming===undefined)return previous??{}
  if(!incoming||typeof incoming!=='object'||Array.isArray(incoming)||Object.keys(incoming).length>500)throw fail('照片说明格式无效')
  const result={...previous}
  for(const [key,value] of Object.entries(incoming)){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['label','location','capturedAt','capturePrecision'].includes(k)))throw fail('照片说明字段无效')
    for(const field of ['label','location'])if(value[field]!==undefined&&(typeof value[field]!=='string'||value[field].length>200))throw fail('照片说明或部位不能超过 200 字')
    if(value.capturedAt!==undefined&&value.capturedAt!==null&&(typeof value.capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value.capturedAt)||!Number.isFinite(Date.parse(value.capturedAt))))throw fail('拍摄时间无效')
    if(value.capturedAt){const [year,month,day]=value.capturedAt.slice(0,10).split('-').map(Number),actual=new Date(Date.UTC(year,month-1,day));if(actual.getUTCFullYear()!==year||actual.getUTCMonth()!==month-1||actual.getUTCDate()!==day)throw fail('拍摄日期无效');const today=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);if(value.capturedAt.length===10?value.capturedAt>today:Date.parse(value.capturedAt)>now.getTime())throw fail('拍摄时间不能在未来')}
    if(value.capturePrecision!==undefined&&!['unknown','day','exact'].includes(value.capturePrecision))throw fail('拍摄时间精度无效')
    const id=aliases.get(key)||key,next={...result[id],...value}
    if(next.capturedAt===null)next.capturePrecision='unknown'
    if(next.capturedAt&&next.capturePrecision&&next.capturePrecision!==(next.capturedAt.length===10?'day':'exact'))throw fail('拍摄时间与精度不一致')
    result[id]=next
  }
  return result
}
