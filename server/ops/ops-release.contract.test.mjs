import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Ops page is a snapshot console rather than a cost analytics dashboard', async () => {
  const source = await readFile(new URL('../../src/pages/Ops/index.tsx', import.meta.url), 'utf8')
  for (const required of ['Hoooho · 费用总控台', '费用来源快照', '查看大图', '打开原平台', '立即更新', '手动更新', '最近 30 天快照']) assert.match(source, new RegExp(required))
  for (const removed of ['Operations & Billing', 'Monthly Estimated Cost', 'Production Health', 'Capacity Alerts', 'Cost Breakdown', 'Services（服务总表）', 'Runway（预计可维持时间）']) assert.equal(source.includes(removed), false)
  assert.doesNotMatch(source, /localStorage|sessionStorage/)
})

test('snapshot image endpoints remain behind Ops authorization', async () => {
  const production = await readFile(new URL('../app.mjs', import.meta.url), 'utf8')
  const development = await readFile(new URL('./vite-ops-plugin.mjs', import.meta.url), 'utf8')
  for (const source of [production, development]) {
    assert.match(source, /assertOpsAccess/)
    assert.match(source, /snapshots/)
    assert.match(source, /image/)
    assert.match(source, /private, no-store/)
  }
})
