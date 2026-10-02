import { createAIProvider, createAudioProvider } from '../providers/provider-factory.mjs'
import { readOpenAIErrorDetails } from '../providers/openai-error.mjs'
import { MedicalSummaryError } from '../medical-summary-service.mjs'
import { fail } from './contract.mjs'

export class BusinessModel {
  constructor(options = {}) { this.provider = options.provider ?? createAIProvider(options); this.audioProvider = options.audioProvider ?? (options.provider?.name !== 'bailian' && options.provider ? options.provider : createAudioProvider('TTS', options)); this.logger=options.logger??console;const limit=Number(options.maxTokens??process.env.AI_BUSINESS_MAX_OUTPUT_TOKENS??16000);this.maxTokens=Number.isInteger(limit)&&limit>=3000&&limit<=32000?limit:16000 }
  async structured({ task, schema, instructions, input, vision = false, signal, syntheticEvidence, onSyntheticOutput }) {
    const p=this.provider
    if(p?.configurationError) throw p.configurationError
    if(!p?.apiKey) throw fail('整理服务尚未配置，仍可手动记录',503,'AI_NOT_CONFIGURED')
    const started=Date.now(), model=p.name==='bailian'?(vision?p.visionModel:p.model):vision?(process.env.AI_VISION_MODEL||p.model):(process.env.AI_DRAFT_MODEL||p.model)
    try {
      const timeout=p.config?.timeoutMs??60000
      const response=await p.fetch(`${p.baseUrl}/responses`,{method:'POST',syntheticEvidence,onSyntheticOutput,headers:{Authorization:`Bearer ${p.apiKey}`,'Content-Type':'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout),body:JSON.stringify({model,instructions,input,store:false,max_output_tokens:Math.min(this.maxTokens,Math.max(3000,Math.ceil(JSON.stringify(input).length/2)+1000)),text:{format:{type:'json_schema',name:'hoooho_business',strict:true,schema}}})})
      if(!response.ok)throw Object.assign(new Error('业务整理接口不可用'),{status:response.status,upstream:await readOpenAIErrorDetails(response)})
      const result=await response.json()
      if(result.status==='incomplete'||result.incomplete_details)throw fail('资料整理未完整返回，草稿未更新，请缩小资料范围',503,'AI_OUTPUT_INCOMPLETE')
      const parts=(result.output??[]).flatMap(item=>item.content??[])
      if(parts.some(part=>part.type==='refusal'))throw fail('这份资料暂不能识别，草稿未更新，仍可手动录入',422,'AI_REFUSAL')
      const text=parts.filter(part=>part.type==='output_text').map(part=>part.text).join('')
      if(!text)throw fail('没有获得可用的整理结果',503,'AI_OUTPUT_EMPTY')
      let value;try{value=JSON.parse(text)}catch{throw fail('整理结果格式无效，草稿未更新',503,'AI_OUTPUT_INVALID')}
      const diagnostics={...result.diagnostics,provider:p.name??'openai',model,task,elapsedMs:Date.now()-started,inputTokens:Number.isInteger(result.usage?.input_tokens)?result.usage.input_tokens:null,outputTokens:Number.isInteger(result.usage?.output_tokens)?result.usage.output_tokens:null,success:true}
      this.logger.info('[Hoooho AI] business usage',diagnostics)
      return {value,diagnostics}
    }catch(error){
      if(error?.code?.startsWith('AI_'))throw error
      const safe=new MedicalSummaryError('整理资料暂时失败，原输入与草稿仍保留', 'AI_BUSINESS_UNAVAILABLE', error)
      this.logger.warn('[Hoooho AI] business failed',{task,...safe.upstream,...safe.failureCodes})
      throw safe
    }
  }
  async speak(text,signal) {
    const p=this.audioProvider
    if(!p?.apiKey)throw fail('语音反馈尚未配置独立 TTS，可继续文字记录',503,'TTS_NOT_CONFIGURED')
    if(typeof text!=='string'||!text.trim()||text.length>600)throw fail('朗读内容无效')
    const started=Date.now()
    try{
    const response=await p.fetch(`${p.baseUrl}/audio/speech`,{method:'POST',headers:{Authorization:`Bearer ${p.apiKey}`,'Content-Type':'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),body:JSON.stringify({model:process.env.AI_SPEECH_MODEL||'gpt-4o-mini-tts',voice:process.env.AI_SPEECH_VOICE||'coral',input:text,response_format:'mp3'})})
    if(!response.ok)throw new MedicalSummaryError('语音反馈暂不可用，可继续文字记录','AI_SPEECH_UNAVAILABLE',{status:response.status,upstream:await readOpenAIErrorDetails(response)})
    const audio=Buffer.from(await response.arrayBuffer())
    if(!audio.length||audio.length>2*1024*1024)throw fail('语音反馈为空或过大',503)
    this.logger.info('[Hoooho AI] business usage',{task:'speech',elapsedMs:Date.now()-started,audioBytes:audio.length})
    return {mimeType:'audio/mpeg',data:audio.toString('base64')}
    }catch(error){const safe=error instanceof MedicalSummaryError?error:new MedicalSummaryError('语音反馈暂不可用，可继续文字记录','AI_SPEECH_UNAVAILABLE',error);this.logger.warn('[Hoooho AI] speech failed',{...safe.upstream,...safe.failureCodes});throw safe}
  }
}
