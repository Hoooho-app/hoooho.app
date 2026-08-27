import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../styles/design-system.css', import.meta.url), 'utf8')
const pageStylesSource = readFileSync(new URL('../../styles/index.css', import.meta.url), 'utf8')
const cardSource = readFileSync(new URL('../../components/health/HealthEventCard.tsx', import.meta.url), 'utf8')

test('健康事件首页使用紧凑标题、家人文案和左对齐年份导航', () => {
  assert.match(pageSource, /label="当前家人"/)
  assert.match(pageSource, /className="health-events-list-title" variant="sectionTitle">事件列表/)
  assert.match(pageSource, /className="hoho-year-tabs health-events-year-tabs"/)
  assert.match(stylesSource, /\.health-events-list-title\s*{[^}]*var\(--hoho-font-size-card-title\)/s)
  assert.match(stylesSource, /\.health-events-year-tabs \.hoho-year-tabs__item\s*{[^}]*flex-grow:\s*0[^}]*text-align:\s*left/s)
})

test('新增健康事件按钮恢复主绿色单色样式', () => {
  assert.match(pageSource, /className="health-events-fab[^\"]*bg-primary[^\"]*shadow-floating/)
  assert.doesNotMatch(pageStylesSource, /\.health-events-fab\s*{[^}]*linear-gradient/s)
})

test('事件定性标题与生命周期状态同行，速览为单行轻量文本', () => {
  assert.match(cardSource, /flex min-w-0 items-center gap-1\.5[^]*event\.definitionTitle[^]*HealthTag[^]*statusPresentation\.label/)
  assert.doesNotMatch(cardSource, /Typography className="min-w-0 flex-1 truncate"/)
  assert.match(stylesSource, /\.hoho-health-tag\[data-tone='info'\][^}]*--hoho-color-info/s)
  assert.match(cardSource, /className="block truncate"[^]*event\.quickFacts\.join\(' · '\)/)
  assert.doesNotMatch(cardSource, /event\.summary/)
  assert.doesNotMatch(cardSource, /<div><HealthTag/)
})

test('长标题和速览在箭头前截断且整张卡片保持单一点击入口', () => {
  assert.match(cardSource, /Typography className="min-w-0 truncate"/)
  assert.match(cardSource, /ChevronRight className="shrink-0/)
  assert.match(cardSource, /navigate\(`\/health-events\/\$\{event\.id\}`\)/)
})
