import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./visitSummary.css', import.meta.url), 'utf8')
const router = readFileSync(new URL('../../app/router.tsx', import.meta.url), 'utf8')
const nurseStation = readFileSync(new URL('../NurseStation/index.tsx', import.meta.url), 'utf8')
const journal = readFileSync(new URL('../HealthEvents/index.tsx', import.meta.url), 'utf8')

test('两个入口共用独立的就诊情况单路由', () => {
  assert.match(router, /visit-summary\/:eventId/)
  assert.match(nurseStation, /navigate\(`\/visit-summary\/\$\{nextActionEventId\}`\)/)
  assert.match(journal, /<Navigate to=\{`\/visit-summary\/\$\{nextActionEventId\}`\}/)
})

test('情况单保留医生直读结构并移除旧弹层操作', () => {
  assert.match(page, /正在整理已有记录/)
  assert.match(page, /按当前情况、经过与依据生成/)
  assert.match(page, /情况概览/)
  assert.match(page, /问题与经过/)
  assert.match(page, /查看依据/)
  assert.doesNotMatch(page, /当面出示|下载交互式文件|关闭情况单/)
  assert.match(css, /position:\s*fixed/)
  assert.match(css, /aria-current/)
})
