// A relative phrase is anchored to the message that actually supplied it.
// This never supplies an occurrence date when no date was given.
export function frontDeskSourceTime(item,sources,referenceNow){
 if(item.timeEditedBy==='user'||!item.timeText||!/今天|今日|昨天|昨日|昨晚|今早|今晨|今晚|前天|前晚|明天|上周|本周|这周|上个月|本月/u.test(item.timeText))return referenceNow
 const refs=item.timeSources?.length?item.timeSources:item.fields?.flatMap(field=>field.sources??[])??[]
 const anchors=[...new Set(refs.flatMap(ref=>sources.filter(source=>source.id===ref.sourceId&&source.page===ref.page&&source.text.includes(item.timeText)&&typeof source.sourceAt==='string'&&Number.isFinite(Date.parse(source.sourceAt))).map(source=>source.sourceAt)))]
 return anchors.length===1?anchors[0]:referenceNow
}
