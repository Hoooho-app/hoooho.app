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
    provider: { name: 'openai', model: 'test-model', summarizeMedicalPreparation: async () => { throw new Error('sensitive upstream detail') } }
  })
  await assert.rejects(() => failed.generate({}), (error) => (
    error.code === 'AI_MEDICAL_SUMMARY_UNAVAILABLE'
    && error.message === 'AI 病情摘要暂时没有生成成功，请稍后重试。'
    && !error.message.includes('sensitive')
  ))
})
