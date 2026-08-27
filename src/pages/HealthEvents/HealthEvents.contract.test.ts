import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../styles/design-system.css', import.meta.url), 'utf8')

test('健康事件首页使用紧凑标题、家人文案和左对齐年份导航', () => {
  assert.match(pageSource, /label="当前家人"/)
  assert.match(pageSource, /className="health-events-list-title" variant="sectionTitle">事件列表/)
  assert.match(pageSource, /className="hoho-year-tabs health-events-year-tabs"/)
  assert.match(stylesSource, /\.health-events-list-title\s*{[^}]*var\(--hoho-font-size-card-title\)/s)
  assert.match(stylesSource, /\.health-events-year-tabs \.hoho-year-tabs__item\s*{[^}]*flex-grow:\s*0[^}]*text-align:\s*left/s)
})
