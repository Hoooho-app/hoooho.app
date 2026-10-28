import fieldLabels from '../../shared/ai-business-field-labels.json' with {type:'json'}

// First-reading observations are temporary source-backed text, not an
// adoptable business draft or permission to assign this document to a child.
export function frontDeskUploadReading(context,messages=[]) {
  if(context.understanding?.recordChangesPending)return null
  const message=[...messages].reverse().find(message=>message.kind==='image'&&message.status==='completed'&&!message.retracted&&(message.files?.length||message.originalFiles?.length))
  if(!message)return null
  const ids=new Set([...message.files??[],...message.originalFiles??[]].map(file=>file.id))
  const facts=(context.facts??[]).filter(fact=>fact.status==='active'&&fact.sources?.some(source=>source.messageId===message.id&&ids.has(source.attachmentId)))
  const text=[...new Set(facts.map(fact=>fact.text?.trim()).filter(Boolean))].join('\n')
  return text?{kind:'first_read',messageId:message.id,version:context.version,text,warnings:['先核对资料内容和归属；目前还未保存记录。'],canAdopt:false,canConfirmSubject:false}:null
}

// Visibility does not authorize structured persistence. The caller retains
// its existing subject, time, version and save checks.
export function frontDeskRecognitionPreview(review, {evidenceVersion, usable, hasOriginals} = {}) {
  if (!hasOriginals || usable || review?.state !== 'ready' || review.frontEvidenceVersion !== evidenceVersion) return null
  const items = review.items ?? []
  const paragraphs = items.flatMap(item => {
    const fields = (item.fields ?? []).filter(field => typeof field.value === 'string' && field.value.trim() && field.sources?.some(source => source.quote?.trim()))
    if (!fields.length) return []
    return [[item.title, ...fields.map(field => `${fieldLabels[field.name] ?? field.name}：${field.value}`), ...(item.timeText ? [`原件时间（待核对）：${item.timeText}`] : [])].filter(Boolean).join('\n')]
  })
  // A completed page transcription must survive even without adoptable items.
  const text = paragraphs.length ? paragraphs.join('\n\n') : (review.sources ?? []).filter(source => ['readable', 'uncertain'].includes(source.status) && source.text?.trim()).map(source => [source.name ? `${source.name} · 第${source.page ?? 1}页` : '', source.text].filter(Boolean).join('\n')).join('\n\n')
  if (!text.trim()) return null
  const otherSubject=['other','multiple'].includes(review.frontSubject?.kind)||items.some(item=>['other','multiple'].includes(item.subject?.kind??item.subject))
  const confirmedOriginalSubject=review.frontSubject?.kind==='current'&&review.frontSubject.confirmed===true&&review.frontSubject.confirmedBy==='user'
  const unknownSubject = items.length ? items.some(item => item.subjectConfirmed !== true || item.unassigned&&item.subjectConfirmedBy!=='user' || ['other', 'unknown', 'multiple'].includes(item.subject?.kind ?? item.subject)) : !confirmedOriginalSubject
  const warnings = [
    ...(unknownSubject ? ['资料中的记录对象待核对，暂不能直接采用到当前成员。'] : []),
    ...(items.some(item => item.needsReview) ? ['部分识别条目需要对照原件核对。'] : []),
    ...(items.some(item => item.occurrenceUncertain) ? ['发生时间尚未确认，请对照原件核对。'] : []),
    ...(review.documentWarnings ?? []),
    ...(review.unmappedRows?.length ? ['部分原件内容尚未整理完整，已有内容仍保留。'] : []),
    ...(review.sources?.some(source => source.status === 'uncertain') ? ['有些原件文字或画面不清楚，请对照原件更正。'] : []),
    ...(review.conflicts?.length ? ['这份资料与已有档案有差异，尚未更新档案。'] : []),
    ...(text.length > 4900 ? ['识别内容较长，请分段核对或精简后编辑。'] : [])
  ]
  return {draftId:review.id, draftVersion:review.version, text, warnings:[...new Set(warnings)], canAdopt:!unknownSubject&&!otherSubject && text.length <= 4900,canConfirmSubject:unknownSubject&&!otherSubject}
}
