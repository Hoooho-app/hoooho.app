import type { ReactNode } from 'react'
import './aiBusiness.css'
export type AIUnverifiedPreview = {status:'unverified';text:string;provider:string;model:string|null;requestId:string|null;warning:string;issues:{message:string;fieldPath:string;stage:string}[]}
export function AIResultPreview({preview,value,onChange,children}:{preview:AIUnverifiedPreview;value:string;onChange:(value:string)=>void;children?:ReactNode}){
  return <section className="ai-result-preview" aria-label="AI初步整理，需核对"><h3>AI初步整理，需核对</h3><p>{preview.warning}</p><small>真实 {preview.provider==='bailian'?'百炼':preview.provider} 返回 · {preview.model}。编辑仅修改预览，不改变原稿或正式记录。</small><ul>{preview.issues.map((issue,i)=><li key={i}>{issue.message}<small> · 核对位置：{issue.fieldPath}</small></li>)}</ul><label>初步整理内容<textarea aria-label="编辑AI初步整理" value={value} maxLength={24000} onChange={e=>onChange(e.target.value)}/></label>{children}</section>
}
