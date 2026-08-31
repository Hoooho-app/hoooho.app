import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const results = JSON.parse(await readFile(path.join(here, 'results-2026-08-31.json'), 'utf8'))

test('正式结果完整且总数守恒', () => {
  assert.equal(results.formal.length, 120)
  assert.equal(results.summary.pass + results.summary.partial + results.summary.fail, 120)
  assert.deepEqual(results.summary, {
    total: 120, pass: 40, partial: 21, fail: 59, passRate: 33.33, strictAcceptRate: 50.83,
    uiExecutionErrors: 0, persistedCases: 71, noDraftCases: 39, memberScopePass: 5,
    variantTotal: 20, variantPass: 5, variantPartial: 2, variantFail: 13, variantPersisted: 15
  })
})

test('所有正式案例完成刷新核验，已持久化记录均来自文字记录', () => {
  assert.ok(results.formal.every(({ refreshed }) => refreshed))
  const records = results.formal.flatMap(({ actual }) => actual)
  assert.ok(records.length > 0)
  assert.ok(records.every(({ sourceType }) => sourceType === 'text_record'))
})

test('结构化结果包含完整逐案证据和核心指标', () => {
  assert.ok(results.formal.every(({ input, expectedChecks, negativeChecks, timeChecks, durationMs }) =>
    input && Array.isArray(expectedChecks) && Array.isArray(negativeChecks) && Array.isArray(timeChecks) && Number.isFinite(durationMs)))
  assert.equal(results.metrics.expectedFactTotal, results.formal.reduce((sum, item) => sum + item.expectedChecks.length + item.negativeChecks.length, 0))
  assert.equal(results.metrics.timeFactTotal, results.formal.reduce((sum, item) => sum + item.timeChecks.length, 0))
  assert.equal(results.metrics.uiFreezeOrTimeoutCount, 0)
})

test('P0 人物归属和非事实安全门槛未被误报为通过', () => {
  assert.equal(results.byGroup.F.pass, 5)
  assert.equal(results.byGroup.G.pass, 5)
  assert.equal(results.formal.find(({ caseId }) => caseId === 'F01').status, 'FAIL')
  assert.equal(results.formal.find(({ caseId }) => caseId === 'G05').status, 'FAIL')
})

test('报告明确排除真实语音、ASR 和生产写入', async () => {
  const report = await readFile(path.join(here, 'health-timeline-oral-text-stress-report-2026-08-31.md'), 'utf8')
  assert.match(report, /不是真实语音\/ASR 测试/)
  assert.match(report, /未向 Production 写入任何测试数据/)
  assert.match(report, /产品判定：FAIL/)
  assert.match(report, /核心指标与公式/)
  assert.match(report, /正式 PARTIAL 明细/)
})
