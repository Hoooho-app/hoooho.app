import assert from 'node:assert/strict'
import test from 'node:test'
import { MedicalSummaryService } from './medical-summary-service.mjs'

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
