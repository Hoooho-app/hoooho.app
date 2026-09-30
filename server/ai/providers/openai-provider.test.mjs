import assert from 'node:assert/strict'
import test from 'node:test'
import { OpenAIProvider } from './openai-provider.mjs'

test('病情摘要保留安全上游诊断且 429 不自动重试', async () => {
  let calls = 0
  const apiKey = 'private-test-credential'
  const provider = new OpenAIProvider({ apiKey, fetchImpl: async () => {
    calls += 1
    return new Response(JSON.stringify({ error: {
      type: 'insufficient_quota', code: 'insufficient_quota',
      message: `You exceeded your current quota, please check your plan and billing details. Authorization: Bearer ${apiKey}; 昨晚咳嗽; user@example.test; org_private`,
      input: '昨晚咳嗽'
    }, private: apiKey }), { status: 429, headers: { 'x-request-id': 'req_test123', 'retry-after': '12' } })
  } })
  await assert.rejects(() => provider.summarizeMedicalPreparation({ sections: [] }), (error) => {
    assert.equal(error.code, 'AI_SUMMARY_PROVIDER_ERROR')
    assert.deepEqual(error.upstream, {
      httpStatus: 429, errorType: 'insufficient_quota', errorCode: 'insufficient_quota',
      errorMessage: 'You exceeded your current quota, please check your plan and billing details.',
      requestId: 'req_test123', retryAfter: '12', failureKind: 'quota_unknown'
    })
    assert.doesNotMatch(JSON.stringify(error), /private-test-credential|咳嗽|example\.test|org_private|Authorization/)
    return true
  })
  assert.equal(calls, 1)
})

test('病情摘要区分频率、余额、项目消费、组织消费及组织使用限额', async () => {
  const cases = [
    ['rate_limit_exceeded', 'rate_limit'], ['slow_down', 'rate_limit'],
    ['credit_balance_exhausted', 'credit_balance'],
    ['project_spend_limit_exceeded', 'project_spend_limit'],
    ['organization_spend_limit_exceeded', 'organization_spend_limit'],
    ['organization_usage_limit_exceeded', 'organization_usage_limit'],
    ['insufficient_quota', 'quota_unknown']
  ]
  for (const [code, kind] of cases) {
    const provider = new OpenAIProvider({ apiKey: 'test-key', fetchImpl: async () => new Response(
      JSON.stringify({ error: { code, type: 'insufficient_quota', message: 'echoed confidential patient input' } }), { status: 429 }
    ) })
    await assert.rejects(() => provider.summarizeMedicalPreparation({}), (error) => {
      assert.equal(error.upstream.failureKind, kind)
      assert.equal(error.upstream.errorMessage, '[REDACTED_UPSTREAM_MESSAGE]')
      assert.equal(error.upstream.requestId, null)
      assert.equal(error.upstream.retryAfter, null)
      return true
    })
  }
})

test('病情摘要非 JSON 错误仅保留状态和合法诊断头', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key', fetchImpl: async () => new Response(
    '<html>secret patient input</html>', { status: 502, headers: { 'x-request-id': 'invalid secret', 'retry-after': 'arbitrary secret' } }
  ) })
  await assert.rejects(() => provider.summarizeMedicalPreparation({}), (error) => {
    assert.deepEqual(error.upstream, { httpStatus: 502, errorType: null, errorCode: null,
      errorMessage: null, requestId: null, retryAfter: null, failureKind: 'provider_error' })
    assert.doesNotMatch(JSON.stringify(error), /secret|patient|html/)
    return true
  })
})

test('病情摘要成功 HTTP 后的空输出与解析失败仍保留状态且不泄露输出', async () => {
  for (const [body, code] of [
    [{ output: [] }, 'EMPTY_AI_SUMMARY'],
    [{ output: [{ content: [{ type: 'output_text', text: 'private patient output' }] }] }, 'INVALID_AI_SUMMARY']
  ]) {
    const provider = new OpenAIProvider({ apiKey: 'test-key', fetchImpl: async () => new Response(
      JSON.stringify(body), { status: 200, headers: { 'x-request-id': 'req_test200' } }
    ) })
    await assert.rejects(() => provider.summarizeMedicalPreparation({}), (error) => {
      assert.equal(error.code, code)
      assert.equal(error.upstream.httpStatus, 200)
      assert.equal(error.upstream.requestId, 'req_test200')
      assert.equal(error.cause, undefined)
      assert.doesNotMatch(JSON.stringify(error), /private patient output/)
      return true
    })
  }
})

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
