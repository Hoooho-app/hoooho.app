import assert from 'node:assert/strict'
import test from 'node:test'
import { MedicalSummaryService } from './medical-summary-service.mjs'

test('OpenAI 可根据去标识化资料生成真实病情摘要', {
  skip: process.env.RUN_OPENAI_LIVE !== '1' ? 'set RUN_OPENAI_LIVE=1 to authorize one live request' : false,
  timeout: 30_000
}, async () => {
  const result = await new MedicalSummaryService().generate({
    memberName: '测试成员',
    sections: [
      { id: 'current', title: '当前健康随记', lines: ['昨晚开始咳嗽', '今早体温 37.8℃'] },
      { id: 'raw', title: '原始记录', lines: ['昨晚 9 点开始咳嗽，今早体温 37.8℃，尚未记录用药。'] },
      { id: 'visit_preferences', title: '本次整理设置', lines: ['主诉：咳嗽和低热'] }
    ]
  })

  assert.equal(result.provider, 'openai')
  assert.ok(result.overview.length > 0)
  assert.ok(Array.isArray(result.keyPoints))
  assert.ok(Array.isArray(result.missingInformation))
})
