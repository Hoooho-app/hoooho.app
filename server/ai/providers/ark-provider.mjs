import Ajv from 'ajv'
import { OpenAIProvider } from './openai-provider.mjs'
import { configurationError, requireDomesticTrial } from './provider-config.mjs'
import { controlledCall } from './call-control.mjs'
import { linkedAISignal } from './telemetry.mjs'
import { meteredFetch } from '../../usage/ai-meter.mjs'
import { readOpenAIErrorDetails } from './openai-error.mjs'

const baseUrl = 'https://ark.cn-beijing.volces.com/api/v3'
const model = 'doubao-seed-2-1-pro-260915'
const fail = (code,message) => configurationError(message,code)
const invalid = () => fail('AI_INPUT_INVALID','方舟请求格式无效，原内容保留')
const ajv = new Ajv({strict:false,allowUnionTypes:true})
const schemas = new Map()
function validate(schema,value) {
  const key = JSON.stringify(schema)
  if (!schemas.has(key)) {
    if (schemas.size >= 32) {
      const [first, entry] = schemas.entries().next().value
      ajv.removeSchema(entry.schema); schemas.delete(first)
    }
    schemas.set(key,{schema,check:ajv.compile(schema)})
  }
  return schemas.get(key).check(value)
}

// Existing consumers use Responses-shaped requests. This adapter only sends
// to Ark's pinned chat-completions endpoint; it never uses OpenAI credentials.
export class ArkProvider extends OpenAIProvider {
  name = 'ark'
  constructor(options = {}) {
    const env = options.env ?? process.env
    requireDomesticTrial(env)
    const apiKey = env.ARK_API_KEY
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw fail('AI_NOT_CONFIGURED','未配置火山方舟 ARK_API_KEY')
    super({...options,apiKey,model,baseUrl})
    this.visionModel = model
    this.requestTimeoutMs = 60000
    const fetchImpl = meteredFetch(options.fetchImpl ?? fetch,'ark',model)
    this.fetch = async (url,init={}) => {
      if (url !== `${baseUrl}/responses` || ['document-page','front-desk-visual-source'].includes(init.task)) throw fail('AI_MODALITY_NOT_CONFIGURED','检查单需经私有 OCR，录音需经独立 ASR')
      let body
      try { body = JSON.parse(init.body) } catch { throw invalid() }
      const format = body?.text?.format
      if (format?.type !== 'json_schema' || !format.schema || typeof format.name !== 'string' || body.model && body.model !== model) throw invalid()
      const input = typeof body.input === 'string' ? [{role:'user',content:[{type:'input_text',text:body.input}]}] : body.input
      if (!Array.isArray(input) || !input.length || (body.instructions != null && typeof body.instructions !== 'string')) throw invalid()
      let images=0, characters=body.instructions?.length??0
      const messages=input.map(item=>{
        if(item?.role!=='user'||!Array.isArray(item.content))throw invalid()
        return {role:'user',content:item.content.map(part=>{
          if(part?.type==='input_text'&&typeof part.text==='string'){characters+=part.text.length;return {type:'text',text:part.text}}
          if(part?.type==='input_image'&&/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(part.image_url??'')&&part.image_url.length<=21*1024*1024){images++;return {type:'image_url',image_url:{url:part.image_url}}}
          throw invalid()
        })}
      })
      if(images>1||characters>65000)throw fail('AI_INPUT_LIMIT','资料超过本次模型输入限制，未截断原内容')
      const deadline=AbortSignal.timeout(60000), parent=linkedAISignal(init.signal), signal=parent?AbortSignal.any([parent,deadline]):deadline
      return controlledCall(async()=>{
        signal.throwIfAborted()
        const response=await fetchImpl(`${baseUrl}/chat/completions`,{
          method:'POST',redirect:'error',signal,
          headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
          body:JSON.stringify({model,messages:[{role:'system',content:body.instructions??''},...messages],stream:false,
            thinking:{type:'disabled'},max_tokens:Math.min(16000,Number.isInteger(body.max_output_tokens)&&body.max_output_tokens>0?body.max_output_tokens:8000),
            ...(Number.isFinite(body.temperature)&&body.temperature>=0&&body.temperature<2?{temperature:body.temperature}:{}),
            response_format:{type:'json_schema',json_schema:{name:format.name,schema:format.schema,strict:true}}})
        })
        if(!response.ok)throw Object.assign(fail(response.status===429?'AI_ARK_RATE_LIMIT':'AI_ARK_UNAVAILABLE','火山方舟暂不可用，原内容保留'),{status:response.status,upstream:await readOpenAIErrorDetails(response)})
        const payload=await response.json(),choice=payload?.choices?.[0]
        if(choice?.message?.refusal||choice?.finish_reason==='content_filter')throw fail('AI_REFUSAL','这份资料暂不能整理，原内容保留')
        if(payload?.error||choice?.finish_reason!=='stop'||choice.message?.tool_calls||typeof choice.message?.content!=='string')throw fail('AI_OUTPUT_INCOMPLETE','方舟未返回完整结果，原内容保留')
        const content=choice.message.content
        try { if(content.length>100000||!validate(format.schema,JSON.parse(content)))throw new Error() } catch { throw fail('AI_OUTPUT_INVALID','方舟输出未通过结构核验，原内容保留') }
        return Response.json({output:[{content:[{type:'output_text',text:content}]}],usage:{input_tokens:payload.usage?.prompt_tokens,output_tokens:payload.usage?.completion_tokens}})
      },env)
    }
  }
}
