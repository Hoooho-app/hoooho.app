import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./AllergyProfilePage.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../styles/product-polish.css', import.meta.url), 'utf8')

test('无记录时直接渲染带当前人物信息的六分类首次记录页', () => {
  assert.match(page, /return items\.length\?<Dashboard[\s\S]*:<CategoryPage fallback="\/health-profile" member=\{member\}\/>/)
  assert.match(page, /allergy-first-entry"><Identity member=\{member\}\/>/)
  assert.match(page, /请记下你知道的过敏信息/)
  assert.match(page, /已经明确的、正在怀疑的，都可以先记下来。/)
  for (const category of ['food', 'drug', 'environment', 'insect', 'contact', 'unknown']) assert.match(page, new RegExp(`id:'${category}'`))
})

test('旧空状态及其开始按钮已从渲染逻辑删除', () => {
  for (const removed of ['allergy-empty', '暂无过敏信息', '记录过敏信息', '开始记录', '下一步']) assert.doesNotMatch(page, new RegExp(removed))
  assert.doesNotMatch(styles, /\.allergy-empty/)
})

test('分类整卡点击在克制反馈后直达对应选择页', () => {
  assert.match(page, /destination=`\/health-profile\/allergy\/new\/\$\{id\}`/)
  assert.match(page, /setTimeout\(\(\)=>navigate\(destination\),200\)/)
  assert.match(page, /prefers-reduced-motion: reduce/)
  assert.match(page, /aria-pressed=\{activeCategory===id\}/)
  assert.match(styles, /button\[aria-pressed=true\]\{transform:translateY\(2px\);background:rgb\(var\(--hoho-color-primary-soft\)\)\}/)
})

test('返回路径区分首次记录与已有记录的添加流程', () => {
  assert.match(page, /CategoryPage fallback="\/health-profile" member=\{member\}/)
  assert.match(page, /CategoryPage fallback="\/health-profile\/allergy" member=\{member\}/)
  assert.match(page, /fallback=\{items\.length\?'\/health-profile\/allergy\/choose':'\/health-profile\/allergy'\}/)
})

test('iPhone SE 紧凑布局完整保留字号和点击面积', () => {
  assert.match(styles, /@media\(max-height:667px\)/)
  assert.match(styles, /\.allergy-first-entry \.allergy-category-grid button\{min-height:82px\}/)
  assert.match(styles, /\.allergy-category-grid button\{[^}]*min-height:104px/)
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/)
})
