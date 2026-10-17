import assert from 'node:assert/strict'
import test from 'node:test'
import { MedicalSummaryService } from './medical-summary-service.mjs'
import { withAITrace, traceMetadata, linkedAISignal } from './providers/telemetry.mjs'

test('病情摘要服务返回服务端模型元数据和受约束内容', async () => {
  const service = new MedicalSummaryService({
    provider: {
      name: 'openai',
      model: 'test-model',
      summarizeMedicalPreparation: async () => ({
        overview: '昨晚开始咳嗽，今早仍有症状。',
        keyPoints: ['已记录咳嗽'],
        missingInformation: ['咳嗽频率尚未记录']
      })
    }
  })

  assert.deepEqual(await service.generate({ sections: [] }), {
    overview: '昨晚开始咳嗽，今早仍有症状。',
    keyPoints: ['已记录咳嗽'],
    missingInformation: ['咳嗽频率尚未记录'],
    provider: 'openai',
    model: 'test-model'
  })
})

test('病情摘要服务未配置或模型失败时返回可安全展示的错误', async () => {
  const missing = new MedicalSummaryService({ provider: null })
  await assert.rejects(() => missing.generate({}), (error) => (
    error.code === 'AI_MEDICAL_SUMMARY_NOT_CONFIGURED' && error.status === 503
  ))

  const failed = new MedicalSummaryService({
    logger: { warn() {} },
    provider: { name: 'openai', model: 'test-model', summarizeMedicalPreparation: async () => { throw new Error('sensitive upstream detail') } }
  })
  await assert.rejects(() => failed.generate({}), (error) => (
    error.code === 'AI_MEDICAL_SUMMARY_UNAVAILABLE'
    && error.message === 'AI 病情摘要暂时没有生成成功，请稍后重试。'
    && !error.message.includes('sensitive')
    && !error.cause?.message.includes('sensitive')
  ))
})

test('病情摘要仅日志记录允许的诊断字段，前端错误保持通用', async () => {
  const logs = []
  const upstream = {
    httpStatus: 429, errorType: 'insufficient_quota', errorCode: 'credit_balance_exhausted',
    errorMessage: 'Your organization has no prepaid credits remaining.',
    requestId: 'req_test123', retryAfter: null, failureKind: 'credit_balance'
  }
  const service = new MedicalSummaryService({
    logger: { warn: (...args) => logs.push(args) },
    provider: { summarizeMedicalPreparation: async () => {
      throw Object.assign(new Error('raw secret patient input'), { upstream, rawResponse: 'private full response' })
    } }
  })
  await assert.rejects(() => service.generate({ sections: [{ lines: ['patient input'] }] }), (error) => {
    assert.equal(error.status, 503)
    assert.equal(error.code, 'AI_MEDICAL_SUMMARY_UNAVAILABLE')
    assert.equal(error.message, 'AI 病情摘要暂时没有生成成功，请稍后重试。')
    assert.deepEqual(error.upstream, upstream)
    assert.doesNotMatch(error.cause.message, /raw|secret|patient/)
    return true
  })
  assert.equal(logs.length, 1)
  assert.deepEqual(logs[0][1], { ...upstream, providerCode: null, transportCode: null })
  assert.doesNotMatch(JSON.stringify(logs), /secret|patient input|rawResponse|full response/)
})

test('病情摘要保留允许的网络错误码但不保留网络异常原文', async () => {
  const logs = []
  const service = new MedicalSummaryService({
    logger: { warn: (...args) => logs.push(args) },
    provider: { summarizeMedicalPreparation: async () => {
      throw new Error('Bearer private-token patient input', { cause: { code: 'ECONNRESET', secret: 'private-token' } })
    } }
  })
  await assert.rejects(() => service.generate({}), (error) => {
    assert.equal(error.failureCodes.transportCode, 'ECONNRESET')
    assert.equal(error.cause.transportCode, 'ECONNRESET')
    assert.doesNotMatch(JSON.stringify(error), /private-token|patient input|Bearer/)
    return true
  })
  assert.equal(logs[0][1].transportCode, 'ECONNRESET')
  assert.doesNotMatch(JSON.stringify(logs), /private-token|patient input|Bearer/)
})

test('同账号同来源的并发摘要只请求一次，结果不共享可变引用，失败不会被缓存',async()=>{
  let release,calls=0
  const gate=new Promise(resolve=>{release=resolve})
  const provider={name:'bailian',model:'same-model',summarizeMedicalPreparation:async()=>{calls++;await gate;return {overview:'合成摘要',keyPoints:[]}}}
  const service=new MedicalSummaryService({provider,logger:{warn(){}}}),summary={sections:[]}
  const first=service.generate(summary,'a'),second=service.generate(summary,'a')
  await Promise.resolve();assert.equal(calls,1);release()
  const [a,b]=await Promise.all([first,second]);a.keyPoints.push('仅改变当前结果');assert.deepEqual(b.keyPoints,[])
  await service.generate(summary,'b');assert.equal(calls,2)
  provider.summarizeMedicalPreparation=async()=>{calls++;throw new Error('fixture failure')}
  await assert.rejects(service.generate(summary,'a'));await assert.rejects(service.generate(summary,'a'));assert.equal(calls,4)
})

test('一个订阅者取消不影响同源请求，全部取消时终止摘要上游请求',async()=>{
  let release,calls=0,requestSignal
  const provider={name:'openai',model:'same-model',fetch:async(_url,init)=>{calls++;requestSignal=init.signal;return new Promise((resolve,reject)=>{release=()=>resolve(Response.json({overview:'保留的结果'}));init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})})},async summarizeMedicalPreparation(){return (await this.fetch('fixture',{})).json()}}
  const service=new MedicalSummaryService({provider,logger:{warn(){}}}),one=new AbortController(),two=new AbortController()
  const first=service.generate({sections:[]},'a',{signal:one.signal}),second=service.generate({sections:[]},'a',{signal:two.signal})
  await Promise.resolve();assert.equal(calls,1);const rejected=assert.rejects(first,error=>error.name==='AbortError');one.abort();await rejected;assert.equal(requestSignal.aborted,false)
  release();assert.equal((await second).overview,'保留的结果')
  const last=new AbortController(),pending=service.generate({sections:[]},'a',{signal:last.signal})
  await Promise.resolve();const stopped=assert.rejects(pending,error=>error.name==='AbortError');last.abort();await stopped;assert.equal(requestSignal.aborted,true)
  await Promise.resolve();assert.equal(service.inFlight.size,0)
})


test('HTTP trace cancellation detaches one coalesced summary subscriber without cancelling the remaining request', async t => {
  const firstHttp = new AbortController(), secondHttp = new AbortController()
  const firstTrace = '11111111-1111-4111-8111-111111111111', secondTrace = '22222222-2222-4222-8222-222222222222'
  let calls = 0, release, entered, upstreamSignal, upstreamTrace, inheritedSignal
  const started = new Promise(resolve => { entered = resolve })
  const provider = {
    name: 'bailian', model: 'same-model',
    fetch: async (_url, init) => {
      calls++; upstreamTrace = traceMetadata(); inheritedSignal = linkedAISignal()
      // Mirror the production provider's ALS signal composition. Checking only
      // init.signal would miss inheritance of the first HTTP request's signal.
      upstreamSignal = linkedAISignal(init.signal)
      entered()
      return new Promise((resolve, reject) => {
        const stop = () => reject(upstreamSignal.reason)
        upstreamSignal.addEventListener('abort', stop, { once: true })
        release = () => { upstreamSignal.removeEventListener('abort', stop); resolve(Response.json({ overview: 'shared verified result', keyPoints: [] })) }
        if (upstreamSignal.aborted) stop()
      })
    },
    async summarizeMedicalPreparation() { return (await this.fetch('fixture', {})).json() }
  }
  const service = new MedicalSummaryService({ provider, logger: { warn() {} } }), summary = { sections: [] }
  const first = withAITrace({ traceId: firstTrace, operation: 'medical-summary', signal: firstHttp.signal }, () => service.generate(summary, 'same-account'))
  const second = withAITrace({ traceId: secondTrace, operation: 'medical-summary', signal: secondHttp.signal }, () => service.generate(summary, 'same-account'))
  t.after(() => release?.())
  await started
  assert.equal(calls, 1)
  assert.deepEqual(upstreamTrace, { traceId: firstTrace, operation: 'medical-summary' })
  const cancelled = assert.rejects(first, error => error.name === 'AbortError')
  firstHttp.abort(); await cancelled
  assert.equal(upstreamSignal.aborted, false)
  assert.equal(inheritedSignal, undefined)
  release()
  assert.equal((await second).overview, 'shared verified result')
  assert.equal(secondHttp.signal.aborted, false)
  assert.equal(calls, 1); assert.equal(service.inFlight.size, 0)
  assert.deepEqual(traceMetadata(), {})
})
