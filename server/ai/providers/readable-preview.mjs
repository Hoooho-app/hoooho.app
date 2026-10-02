import fieldLabels from '../../../shared/ai-business-field-labels.json' with {type:'json'}

// Display-only projection, never a persistence DTO or a replacement validator.
// Unknown JSON keys, reasoning, tools and envelope metadata are not displayed.
export function readablePreview(content, metadata = {}) {
  if (typeof content !== 'string' || !content.trim() || content.length > 60000 || /Bearer\s|sk-[A-Za-z0-9]|PRIVATE KEY/i.test(content)) return null
  let value
  try { value = JSON.parse(content) } catch {
    if (/^[\s]*[\[{]|```|<\/?(?:script|html)|"(?:items|fields)"\s*:/i.test(content)) return null
    value = content
  }
  // Observed Bailian OCR response: an array of text/status objects. It is still
  // invalid against the OCR object schema; project text for review only.
  if(Array.isArray(value)){
    if(!value.length||value.length>12||value.some(part=>!part||Array.isArray(part)||typeof part!=='object'||typeof part.text!=='string'))return null
    value={text:value.map(part=>part.text).join('\n\n')}
  }
  if(typeof value==='string'&&/^[\s]*[\[{]|^```/.test(value))return null
  const lines = [], add = v => { if (typeof v === 'string' && v.trim()) lines.push(v.trim()) }
  if (typeof value === 'string') add(value)
  else if (value && !Array.isArray(value)) {
    if(Array.isArray(value.items)&&value.items.length>30||Array.isArray(value.keyPoints)&&value.keyPoints.length>12||Array.isArray(value.missingInformation)&&value.missingInformation.length>20)return null
    add(value.text); add(value.overview)
    for (const item of Array.isArray(value.items) ? value.items.slice(0,30) : []) {
      if (!item || typeof item !== 'object') continue
      if(Array.isArray(item.fields)&&item.fields.length>50)return null
      add(item.title)
      if (typeof item.timeText === 'string') add(`发生时间原话（待核对）：${item.timeText}`)
      for (const field of Array.isArray(item.fields) ? item.fields.slice(0,50) : []) {
        if (typeof field?.value === 'string') add(`${fieldLabels[field.name] ?? '待核对内容'}：${field.value}`)
        if (typeof field?.quote === 'string') add(`模型引用（未验证）：${field.quote}`)
      }
    }
    for (const point of Array.isArray(value.keyPoints) ? value.keyPoints.slice(0,12) : []) add(typeof point === 'string' ? point : point?.text)
    for (const line of Array.isArray(value.missingInformation) ? value.missingInformation.slice(0,20) : []) if(typeof line==='string') add(`待补充：${line}`)
  }
  const text = lines.join('\n')
  if (!text || text.length > 24000) return null // No silent truncation.
  return { text, provider: ['bailian','openai'].includes(metadata.provider) ? metadata.provider : 'unknown', model: typeof metadata.model==='string'&&/^[\w.:-]{1,100}$/.test(metadata.model)?metadata.model:null, requestId: typeof metadata.requestId==='string'&&/^[\w.:-]{1,200}$/.test(metadata.requestId)?metadata.requestId:null, inputTokens:Number.isInteger(metadata.inputTokens)?metadata.inputTokens:null,outputTokens:Number.isInteger(metadata.outputTokens)?metadata.outputTokens:null }
}

export function quarantinePreview(preview, validation) {
  if (!preview) return null
  const messages = { source_validation:'来源或否定关系未通过核对', schema_validation:'整理字段不符合记录格式', semantic_validation:'事实或记录类型尚未通过核对', output_truncation:'输出不完整，不能作为完整报告', json_parse:'返回内容格式未通过核对', response_unpack:'返回内容格式未通过核对' }
  const stage=Object.hasOwn(messages,validation?.stage)?validation.stage:'semantic_validation'
  const path=typeof validation?.fieldPath==='string'&&/^\/(?:[A-Za-z0-9_/.-]|\[redacted\]){0,200}$/.test(validation.fieldPath)?validation.fieldPath:'/items'
  return {...preview, status:'unverified', issues:[{message:messages[stage],fieldPath:path,stage}], warning:'AI初步整理，需核对。尚未通过完整校验，不会自动保存或归档，不作为诊断或医嘱。'}
}
