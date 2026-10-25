import {clinicalContext} from '../../../shared/clinical-evidence.mjs'
// Product interaction policy: a short unknown or finish reply ends ordinary
// questions. It is not a negative health finding or a clinical triage criterion.
const unknownBody='(?:不(?:太)?(?:知道|清楚|确定)|说不准|拿不准|没(?:有)?(?:注意|留意|观察|看)(?:到|过|清楚|出来)?|记不清|不记得|想不起来)'
const prefix='(?:(?:嗯|呃|那个|这个|这件事|这|对此|目前|现在|暂时|确实|真的|我也|我|也)[，,、\\s]*)*'
const suffix='(?:了|过|呀|啊|呢|吧|这个|具体情况|具体时间|具体次数|具体部位)*'
const pureUnknown=new RegExp('^'+prefix+'('+unknownBody+')'+suffix+'[，,。！!\\s]*(?:先(?:按(?:已经说过|已有|目前).{0,8})?(?:记下来|记录|保存|整理)(?:吧|一下|了|已有信息)*[。！!\\s]*)?$','u')
const explicitRecord=/^(?:(?:我|我只|我就|我只想|我想|咱们|请|帮我|就|先|只)[，,\s]*)*(?:先)?(?:把[^，。；\n]{1,30})?(?:记下(?:来)?|记|记录|保存|保留|整理)(?:这[^，。；\n]{0,12}|我的担心|已有信息)?(?:吧|了|一下)?[。！!，,\s]*$/u
const pureFinish=/^(?:我(?:想|们)?|要不|咱们|请|帮我)?(?:先|就|直接)?(?:按(?:已经说(?:过)?|目前|已有).{0,8})?(?:记下来|记录|保存|整理)(?:吧|了|一下|这些|这一次|这一条|这条|已有信息|已有的这些)*[。！!，,\s]*$|^(?:不用|不要|不再|别再|别)(?:继续)?(?:问|追问)(?:了|啦|吧)?[。！!，,\s]*$|^(?:谢谢(?:你|您)?|好了|好的|好|嗯|没了|没有了|不说了|先这样|到这里)(?:吧|了)?[。！!，,\s]*$/u
export function nursingResponseIntent(input){
  const text=String(input??'').trim()
  if(!text||/[“”‘’「」『』"']/u.test(text))return {kind:'none',stop:false}
  if(/如果|假如|万一|若是|若出现|明天|后天|下周|将来|准备|打算|计划|以后/u.test(text))return {kind:'none',stop:false}
  if(/^暂时没注意[^，。\n]{1,35}[，,]\s*先按已经说过的情况记录[。]?$/.test(text))return {kind:'unknown',stop:true}
  if(/^先按已经说过的情况记录[，,]\s*不再追问[。]?$/.test(text))return {kind:'finished',stop:true}
  const m=pureUnknown.exec(text)
  if(m){
    const at=text.indexOf(m[1]),scope=clinicalContext(text,at,at+m[1].length)
    if(scope.subject==='current'&&scope.temporality==='current')return {kind:'unknown',stop:true}
  }
  const tail=[...text.matchAll(/[^，,。；;！!？?\n]+/gu)].at(-1)
  if(tail&&(pureFinish.test(tail[0])||explicitRecord.test(tail[0])||/^(?:不想|不愿)(?:再|继续)问了$/u.test(tail[0]))){const at=tail.index,scope=clinicalContext(text,at,at+tail[0].length);if(scope.subject==='current'&&scope.temporality==='current'&&!/如果|假如|万一|明天|后天|准备|打算|计划/u.test(tail[0]))return {kind:'finished',stop:true}}
  if(pureFinish.test(text))return {kind:'finished',stop:true}
  return {kind:'none',stop:false}
}
