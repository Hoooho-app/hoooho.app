import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('./DietaryCardPanel.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./dietaryCard.css', import.meta.url), 'utf8')
const router = readFileSync(new URL('../../app/router.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../NurseStation/index.tsx', import.meta.url), 'utf8')

test('首页唯一入口进入受当前人物保护的忌口出示卡', () => {
  assert.match(home, /title: '忌口出示卡'.*to: '\/dietary-card'/)
  assert.doesNotMatch(home, /忌口出示卡功能暂未开放/)
  assert.match(router, /path: '\/dietary-card'/)
  assert.match(router, /path: '\/dietary-card\/edit'/)
})

test('主页面保留修改、中文、更新、保存图片四项工具且没有全屏入口', () => {
  for (const copy of ['修改', '中文', '更新', '保存图片']) assert.match(page, new RegExp(copy))
  assert.doesNotMatch(page + panel, /全屏|生成卡片|重新生成/)
  assert.match(page, /disabled=\{!presentation\?\.visibleCount \|\| exporting\}/)
})

test('页面以单一纵向滚动承载完整清单并覆盖 320px 窄屏', () => {
  assert.match(styles, /\.dietary-card-scroll[\s\S]*overflow-y: auto/)
  assert.match(styles, /@media \(max-width: 340px\)/)
  assert.doesNotMatch(styles, /\.dietary-(?:display-card|food-grid)[^{]*\{[^}]*overflow-y:\s*(?:auto|scroll)/)
})

test('编辑页保存独立草稿、支持空快照与交叉接触提醒', () => {
  assert.match(page, /structuredClone\(state\.snapshot\)/)
  assert.match(page, /提醒避免共用锅具、餐具接触/)
  assert.match(page, /保存并更新/)
  assert.match(page, /仅调整出示清单，不修改健康档案中的原始记录/)
})
