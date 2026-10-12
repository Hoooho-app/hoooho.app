import type { VisitSheet, CurrentSituationLine } from '../../types/visitSheet'
export function situationData(report:VisitSheet):NonNullable<VisitSheet['currentSituation']> {
  return report.currentSituation ?? {scopeKey:report.photoKey ?? '',description:report.reading?.description ?? report.complaint,symptoms:[] as CurrentSituationLine[],diet:[] as CurrentSituationLine[],changes:[] as CurrentSituationLine[],treatment:[] as CurrentSituationLine[],raw:report.sources.filter(s=>report.reading?.sourceIds.includes(s.id)).map(s=>({text:s.text,sourceId:s.id}))}
}
export function currentSituationText(report:VisitSheet) {
  const s=situationData(report)
  return [`情况描述：${s.description}`, ...(['symptoms','diet','changes','treatment'] as const).flatMap(key=>s[key].length?[`${{symptoms:'症状表现',diet:'近期饮食',changes:'发生与变化',treatment:'已做处理'}[key]}：`,...s[key].map(line=>[line.label?`${line.label}：${line.text}`:line.text,line.note].filter(Boolean).join('\n'))]:[])].join('\n')
}
export function descriptionParts(report:VisitSheet) {
  const s=situationData(report), spans=(s.descriptionEmphasis??s.symptoms.filter(line=>line.emphasize).concat(s.diet).map(line=>line.text)).filter(text=>text&&s.description.includes(text))
  let cursor=0
  const parts:Array<{text:string;emphasize:boolean}>=[]
  while(cursor<s.description.length) {
    const next=spans.map(text=>({text,at:s.description.indexOf(text,cursor)})).filter(p=>p.at>=cursor).sort((a,b)=>a.at-b.at)[0]
    if(!next){parts.push({text:s.description.slice(cursor),emphasize:false});break}
    parts.push({text:s.description.slice(cursor,next.at),emphasize:false},{text:next.text,emphasize:true});cursor=next.at+next.text.length
  }
  return parts
}
export function situationLineParts(text:string,emphasis:string[]=[]){
  const spans=emphasis.filter(e=>e&&text.includes(e)),parts:Array<{text:string;emphasize:boolean}>=[];let cursor=0
  while(cursor<text.length){const next=spans.map(e=>({text:e,at:text.indexOf(e,cursor)})).filter(e=>e.at>=cursor).sort((a,b)=>a.at-b.at)[0];if(!next){parts.push({text:text.slice(cursor),emphasize:false});break}if(next.at>cursor)parts.push({text:text.slice(cursor,next.at),emphasize:false});parts.push({text:next.text,emphasize:true});cursor=next.at+next.text.length}
  return parts
}
