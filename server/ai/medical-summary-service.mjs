import {withAITrace,traceMetadata,linkedAISignal} from './providers/telemetry.mjs'
import { createAIProvider } from './providers/provider-factory.mjs'
import { withAIAccount } from './providers/call-control.mjs'
import { SafeAIProviderError } from './providers/provider-config.mjs'
import { safeOpenAIErrorDetails, safeOpenAIFailureCodes } from './providers/openai-error.mjs'
import { createHash } from 'node:crypto'
import { generateCurrentSituation } from '../visit-sheets/current-situation-model.mjs'

export class MedicalSummaryError extends Error {
  constructor(message, code = 'AI_MEDICAL_SUMMARY_UNAVAILABLE', cause = null) {
    const upstream = cause ? safeOpenAIErrorDetails(cause.upstream ?? { httpStatus: cause.status }) : null
    const failureCodes = safeOpenAIFailureCodes(cause)
    const safeCause = upstream ? Object.assign(new Error('AI upstream request failed'), { upstream, ...failureCodes }) : null
    super(cause instanceof SafeAIProviderError ? cause.message : message, safeCause ? { cause: safeCause } : undefined)
    this.status = 503
    this.code = code
    if(cause?.preview)Object.defineProperty(this,'preview',{value:cause.preview,enumerable:false})
    if(cause instanceof SafeAIProviderError&&cause.validation)this.validation=cause.validation
    if (upstream) {
      this.upstream = upstream
      this.failureCodes = failureCodes
    }
  }
}

export class MedicalSummaryService {
  constructor(options = {}) {
    this.logger = options.logger ?? console
    this.provider = Object.prototype.hasOwnProperty.call(options, 'provider')
      ? options.provider
      : createAIProvider(options)
    this.inFlight = new Map()
  }

  generate(summary, accountId = null, { signal } = {}) {
    signal=linkedAISignal(signal)
    if(signal?.aborted)return Promise.reject(signal.reason)
    const key=createHash('sha256').update(JSON.stringify([accountId,summary])).digest('hex')
    let pending=this.inFlight.get(key)
    if(!pending){
      pending={controller:new AbortController(),subscribers:new Set()}
      this.inFlight.set(key,pending)
      pending.promise=withAITrace({...traceMetadata(),operation:'medical-summary'},()=>Promise.resolve().then(()=>this.generateOnce(summary,accountId,pending.controller.signal))).finally(()=>{if(this.inFlight.get(key)===pending)this.inFlight.delete(key)})
    }
    const subscriber=Symbol();pending.subscribers.add(subscriber)
    return new Promise((resolve,reject)=>{
      let settled=false
      const cleanup=()=>{signal?.removeEventListener('abort',abort);pending.subscribers.delete(subscriber)}
      const abort=()=>{if(settled)return;settled=true;cleanup();if(!pending.subscribers.size){if(this.inFlight.get(key)===pending)this.inFlight.delete(key);pending.controller.abort(signal.reason)}reject(signal.reason)}
      signal?.addEventListener('abort',abort,{once:true})
      if(signal?.aborted)abort()
      pending.promise.then(result=>{if(settled)return;settled=true;cleanup();resolve(structuredClone(result))},error=>{if(settled)return;settled=true;cleanup();reject(error)})
    })
  }

  async generateOnce(summary, accountId, signal) {
    if (!this.provider) {
      throw new MedicalSummaryError('AI 病情摘要服务尚未配置，请稍后重试。', 'AI_MEDICAL_SUMMARY_NOT_CONFIGURED')
    }
    try {
      signal.throwIfAborted()
      // The summary-specific facade propagates cancellation to existing
      // provider methods without changing the shared provider or transport.
      const provider=Object.create(this.provider)
      if(typeof this.provider.fetch==='function')provider.fetch=(url,init={})=>this.provider.fetch(url,{...init,signal:init.signal?AbortSignal.any([signal,init.signal]):signal})
      const result = await withAIAccount(accountId, () => summary.currentSituationSources&&typeof provider.fetch==='function'
        ? generateCurrentSituation(provider,summary,signal)
        : provider.summarizeMedicalPreparation(summary))
      signal.throwIfAborted()
      return {
        ...result,
        provider: this.provider.name,
        model: this.provider.model
      }
    } catch (error) {
      if(signal.aborted)throw signal.reason
      const failure = new MedicalSummaryError('AI 病情摘要暂时没有生成成功，请稍后重试。', 'AI_MEDICAL_SUMMARY_UNAVAILABLE', error)
      this.logger.warn('[Hoooho AI] medical summary failed', { ...failure.upstream, ...failure.failureCodes,...(failure.validation?{validation:failure.validation}:{}) })
      throw failure
    }
  }
}
