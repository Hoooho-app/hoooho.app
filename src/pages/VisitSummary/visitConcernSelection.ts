import type { HealthEventApiDto } from '../../types'

export interface VisitConcernCandidate { eventIds:string[]; id:string; label:string; latestAt:string; status:HealthEventApiDto['status']; summary:string }
const active=(event:HealthEventApiDto)=>event.status!=='recovered'
const respiratory=/发热|发烧|体温|咳嗽|咽|鼻|呼吸|感冒|身体不适/
const day=86400000

export function buildVisitConcernCandidates(events:HealthEventApiDto[],now=new Date()):VisitConcernCandidate[]{
  const sorted=events.filter(active).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));const groups:HealthEventApiDto[][]=[]
  for(const event of sorted){const compatible=groups.find(group=>Math.abs(Date.parse(event.startTime)-Date.parse(group[0].startTime))<=7*day&&respiratory.test(event.title)&&respiratory.test(group[0].title));if(compatible)compatible.push(event);else groups.push([event])}
  return groups.map(group=>{const latest=group.reduce((a,b)=>Date.parse(a.updatedAt)>Date.parse(b.updatedAt)?a:b);const earliest=group.reduce((a,b)=>Date.parse(a.startTime)<Date.parse(b.startTime)?a:b);const text=group.map(event=>event.title).join('、').replace(/发烧/g,'发热');const label=/发热/.test(text)&&/咳嗽/.test(text)?'发热伴咳嗽':latest.title;return{eventIds:group.map(event=>event.id),id:group.map(event=>event.id).sort().join(':'),label,latestAt:latest.updatedAt,status:latest.status,summary:`${formatStart(earliest.startTime)}起 · 最近记录${formatRelative(latest.updatedAt,now)} · ${latest.status==='handling'?'处理中':'仍在观察'}`}}).sort((a,b)=>Date.parse(b.latestAt)-Date.parse(a.latestAt))
}
function formatStart(value:string){return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(new Date(value))}
function formatRelative(value:string,now:Date){const date=new Date(value);return date.toDateString()===now.toDateString()?`今天${new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date)}`:new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(date)}
