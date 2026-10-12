export type SmartRecordField = {name:string;value:string;editedBy?:string;sources:{quote:string}[]}
export type SmartRecordItem = {id:string;category:string;title:string;timeText:string|null;time:{resolvedStart:string|null;precision:string;defaulted?:boolean};fields:SmartRecordField[];categoryChanged?:boolean;timeChanged?:boolean}
export function smartRecordTimeLabel(item: SmartRecordItem) {
  if (item.timeText?.trim()) return item.timeText
  if (item.time.defaulted && item.time.resolvedStart && Number.isFinite(Date.parse(item.time.resolvedStart))) return `${new Date(item.time.resolvedStart).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}（录入时间）`
  return '待确认'
}
export type SmartRecordDraft = {id:string;version:number;state:string;inputText:string;items:SmartRecordItem[];result:{count:number;records:{eventId:string;recordId:string}[]}|null;preview?:{text:string}|null;unmappedRows?:{text:string}[];documentWarnings?:string[];sources?:{status:string}[]}
export const recordCategoryLabels:Record<string,string> = {diet:'饮食',symptom:'症状',sleep:'睡眠',elimination:'排便',medication:'用药',care:'护理',measurement:'测量',growth:'成长',injury:'受伤',vaccination:'接种',environment:'环境',visit:'就诊',examination:'检查',activity:'活动',emotion:'情绪',social:'社交',other:'其他'}
const keyFields:Record<string,string[]> = {diet:['food','amount','unit','reaction'],symptom:['symptom','location','severityOriginal','handling'],sleep:['sleepAt','wakeAt','durationMinutes','sleepKind','quality'],medication:['medicationName','doseOriginal','frequency','route']}
export function isKeyRecordField(category:string,name:string) { return !keyFields[category] || keyFields[category].includes(name) }
export function retainSmartRecordEdits(next:SmartRecordDraft,previous?:SmartRecordDraft):SmartRecordDraft {
  if(!previous)return next
  const evidence=(item:SmartRecordItem)=>JSON.stringify(item.fields.map(f=>[f.name,f.sources.map(s=>s.quote).sort()]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
  return {...next,items:next.items.map(item=>{
    const old=previous.items.find(i=>evidence(i)===evidence(item))
    if(!old)return item
    return {...item,...(old.categoryChanged?{category:old.category,categoryChanged:true}:{}),...(old.timeChanged?{timeText:old.timeText,timeChanged:true}:{}),fields:item.fields.map(field=>{const edited=old.fields.find(f=>f.name===field.name&&f.editedBy==='user');return edited?{...field,value:edited.value,editedBy:'user'}:field})}
  })}
}
