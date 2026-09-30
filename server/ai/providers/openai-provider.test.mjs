import assert from 'node:assert/strict'
import test from 'node:test'
import { OpenAIProvider } from './openai-provider.mjs'

test('OpenAI 健康事实提示词区分用户明确确诊与猜测', async () => {
  let requestBody
  const provider = new OpenAIProvider({
    apiKey: 'test-key',
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body)
      return { ok: true, json: async () => ({
        output: [{ content: [{ type: 'output_text', text: JSON.stringify({ facts: [], confidence: 1 }) }] }]
      }) }
    }
  })
  await provider.organize('确诊了那个荨麻疹')
  assert.match(requestBody.instructions, /用户明确转述.*user_report.*confirmed/)
  assert.match(requestBody.instructions, /猜测、疑似或 AI 判断不得标记 confirmed/)
  assert.match(requestBody.input, /确诊了那个荨麻疹/)
})

test('OpenAI Vision 使用 Responses 图片输入和严格结构化输出', async () => {
  let requestBody
  const provider = new OpenAIProvider({
    apiKey: 'test-key',
    model: 'vision-test-model',
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({
          output: [{ content: [{ type: 'output_text', text: JSON.stringify({
            category: 'report', summary: '血常规报告', observedText: '血常规',
            temperatureValue: null, medicationName: null, examinationName: '血常规', confidence: 0.96
          }) }] }]
        })
      }
    }
  })

  const result = await provider.analyzeImage({
    name: 'report.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA=='
  })
  assert.equal(result.category, 'report')
  assert.equal(requestBody.input[0].content[1].type, 'input_image')
  assert.equal(requestBody.input[0].content[1].image_url, 'data:image/png;base64,AA==')
  assert.equal(requestBody.text.format.type, 'json_schema')
  assert.equal(requestBody.text.format.strict, true)
})

test('OpenAI 病情摘要使用 Responses 严格结构化输出且关闭服务端存储', async () => {
  let requestBody
  const provider = new OpenAIProvider({
    apiKey: 'test-key',
    model: 'summary-test-model',
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({
          output: [{ content: [{ type: 'output_text', text: JSON.stringify({
            overview: '昨晚开始咳嗽，今早体温 37.8℃。',
            keyPoints: ['咳嗽从昨晚开始', '今早体温 37.8℃'],
            missingInformation: ['咳嗽频率尚未记录']
          }) }] }]
        })
      }
    }
  })

  const result = await provider.summarizeMedicalPreparation({ sections: [
    { id: 'basic', title: '当前人物', lines: ['姓名：测试成员', '年龄：8岁'] },
    { id: 'visit_preferences', title: '本次整理设置', lines: ['整理人：测试家长', '主诉：咳嗽'] }
  ] })
  assert.equal(result.overview, '昨晚开始咳嗽，今早体温 37.8℃。')
  assert.equal(requestBody.model, 'summary-test-model')
  assert.equal(requestBody.store, false)
  assert.equal(requestBody.max_output_tokens, 800)
  assert.equal(requestBody.text.format.type, 'json_schema')
  assert.equal(requestBody.text.format.strict, true)
  assert.match(requestBody.instructions, /不得提供治疗、处方或用药建议/)
  assert.doesNotMatch(requestBody.input, /姓名：测试成员|整理人：测试家长/)
})
