import assert from 'node:assert/strict'
import test from 'node:test'
import { ImageAnalysisService } from './image-analysis-service.mjs'

const attachment = {
  id: 'attachment-1',
  name: 'thermometer.png',
  mimeType: 'image/png',
  dataUrl: 'data:image/png;base64,AA==',
  createdAt: '2026-08-12T15:25:00.000Z'
}

test('体温计图片生成体温事实，时间来自附件记录时间', async () => {
  const service = new ImageAnalysisService({
    provider: {
      name: 'fixture-vision',
      analyzeImage: async () => ({
        category: 'temperature', summary: '体温计显示 38.5℃', observedText: '38.5',
        temperatureValue: 38.5, medicationName: null, examinationName: null, confidence: 0.98
      })
    }
  })

  const result = await service.analyze(attachment)
  assert.equal(result.status, 'completed')
  assert.equal(result.category, 'temperature')
  assert.equal(result.extractedFacts.length, 1)
  assert.equal(result.extractedFacts[0].type, 'temperature')
  assert.equal(result.extractedFacts[0].temperature.max, 38.5)
  assert.equal(result.extractedFacts[0].time.resolvedStart, attachment.createdAt)
})

test('药盒只保存可见药品观察，不推断已经服药', async () => {
  const service = new ImageAnalysisService({
    provider: {
      name: 'fixture-vision',
      analyzeImage: async () => ({
        category: 'medication', summary: '', observedText: '布洛芬',
        temperatureValue: null, medicationName: '布洛芬', examinationName: null, confidence: 0.9
      })
    }
  })

  const result = await service.analyze(attachment)
  assert.equal(result.summary, '图片中可见药品“布洛芬”')
  assert.deepEqual(result.extractedFacts, [])
})

test('未配置 Vision Provider 时明确降级，不伪造图片分析', async () => {
  const result = await new ImageAnalysisService({ provider: null }).analyze(attachment)
  assert.equal(result.status, 'unavailable')
  assert.equal(result.summary, '图片记录')
  assert.equal(result.provider, null)
  assert.deepEqual(result.extractedFacts, [])
})

test('Vision Provider 失败时返回可恢复状态', async () => {
  const service = new ImageAnalysisService({
    provider: {
      name: 'fixture-vision',
      analyzeImage: async () => { throw Object.assign(new Error('network'), { code: 'VISION_TIMEOUT' }) }
    }
  })
  const result = await service.analyze(attachment)
  assert.equal(result.status, 'failed')
  assert.equal(result.errorCode, 'VISION_TIMEOUT')
  assert.equal(result.summary, '图片记录')
})
