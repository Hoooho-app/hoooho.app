import type { AIUnverifiedPreview } from '../../features/ai-business/AIResultPreview'
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function preliminarySummaryExport(text:string,preview:AIUnverifiedPreview,format:'text'|'html'){
  const content=['Hoooho · AI初步摘要 · 待核对（非已确认报告）',preview.warning,`供应商 ${preview.provider} · 模型 ${preview.model??'未提供'}`, ...preview.issues.map(i=>`${i.message} · ${i.fieldPath}`),'以下内容可经过用户编辑，尚未验证，不覆盖原摘要：',text,'不作为诊断、处方或医嘱；不能据此自行开药或调整剂量。'].join('\n\n')
  return format==='text'?content:`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'none'"><title>AI初步摘要 · 待核对</title></head><body><h1>待核对 · 非已确认报告</h1>${content.split('\n').map(line=>`<p>${escape(line)}</p>`).join('')}</body></html>`
}
