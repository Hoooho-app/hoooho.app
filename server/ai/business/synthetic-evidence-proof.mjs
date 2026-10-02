// In-process capability only: a request JSON cannot manufacture this symbol.
export const syntheticEvidenceProof=Symbol('fixed-synthetic-evidence')
export function safeSyntheticStage({task,content,requestId,inputTokens,outputTokens}){
 if(!['draft-extraction','document-page'].includes(task)||typeof content!=='string'||content.length>24000||/\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN/.test(content))return null
 return {task,structuredText:content,requestId:typeof requestId==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(requestId)?requestId:null,inputTokens:Number.isInteger(inputTokens)?inputTokens:null,outputTokens:Number.isInteger(outputTokens)?outputTokens:null}
}
