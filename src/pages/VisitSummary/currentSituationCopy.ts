import type { VisitSheet, CurrentSituationLine } from '../../types/visitSheet'
export function situationData(report:VisitSheet) {
  return report.currentSituation ?? {scopeKey:report.photoKey ?? '',description:report.reading?.description ?? report.complaint,symptoms:[] as CurrentSituationLine[],diet:[] as CurrentSituationLine[],changes:[] as CurrentSituationLine[],treatment:[] as CurrentSituationLine[],raw:report.sources.filter(s=>report.reading?.sourceIds.includes(s.id)).map(s=>({text:s.text,sourceId:s.id}))}
}
export function currentSituationText(report:VisitSheet) {
  const s=situationData(report)
  return [`情况描述：${s.description}`, ...(['symptoms','diet','changes','treatment'] as const).flatMap(key=>s[key].length?[`${{symptoms:'症状表现',diet:'近期饮食',changes:'发生与变化',treatment:'已做处理'}[key]}：`,...s[key].map(line=>line.text)]:[])].join('\n')
}
export function descriptionParts(report:VisitSheet) {
  const s=situationData(report), spans=s.symptoms.filter(line=>line.emphasize).concat(s.diet).map(line=>line.text).filter(text=>text&&s.description.includes(text))
  let cursor=0
  const parts:Array<{text:string;emphasize:boolean}>=[]
  while(cursor<s.description.length) {
    const next=spans.map(text=>({text,at:s.description.indexOf(text,cursor)})).filter(p=>p.at>=cursor).sort((a,b)=>a.at-b.at)[0]
    if(!next){parts.push({text:s.description.slice(cursor),emphasize:false});break}
    parts.push({text:s.description.slice(cursor,next.at),emphasize:false},{text:next.text,emphasize:true});cursor=next.at+next.text.length
  }
  return parts
}
