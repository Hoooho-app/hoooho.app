import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../styles/design-system.css', import.meta.url), 'utf8')
const pageStylesSource = readFileSync(new URL('../../styles/index.css', import.meta.url), 'utf8')
const cardSource = readFileSync(new URL('../../components/health/HealthEventCard.tsx', import.meta.url), 'utf8')
const cardSurfaceSource = readFileSync(new URL('../../components/health/HealthEventCardSurface.tsx', import.meta.url), 'utf8')
const filterSource = readFileSync(new URL('../../components/health/HealthEventFilterSheet.tsx', import.meta.url), 'utf8')

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
  assert.match(cardSource, /HealthEventCardSurface/)
  assert.match(cardSurfaceSource, /flex min-w-0 items-center gap-1\.5[^]*definitionTitle[^]*HealthTag[^]*statusPresentation\.label/)
  assert.doesNotMatch(cardSurfaceSource, /Typography className="min-w-0 flex-1 truncate"/)
  assert.match(stylesSource, /\.hoho-health-tag\[data-tone='info'\][^}]*--hoho-color-info/s)
  assert.match(cardSurfaceSource, /className="block truncate"[^]*quickFacts\.join\(' · '\)/)
  assert.doesNotMatch(cardSource, /event\.summary/)
  assert.doesNotMatch(cardSource, /<div><HealthTag/)
})

test('长标题和速览在箭头前截断且整张卡片保持单一点击入口', () => {
  assert.match(cardSurfaceSource, /Typography className="min-w-0 truncate"/)
  assert.match(cardSurfaceSource, /ChevronRight className="shrink-0/)
  assert.match(cardSource, /navigate\(`\/health-events\/\$\{event\.id\}`\)/)
})

test('已康复事件使用低饱和成功色卡片背景', () => {
  assert.match(cardSource, /health-event-list-card--recovered/)
  assert.match(pageStylesSource, /\.hoho-health-card\.health-event-list-card--recovered\s*{[^}]*--hoho-color-success[^}]*5%/s)
})

test('月份筛选以单行数字呈现且事件类型来自列表定性标题', () => {
  assert.match(filterSource, /health-events-month-row[^]*Array\.from\(\{ length: 12 \}/)
  assert.match(filterSource, />\{month\}<\/button>/)
  assert.doesNotMatch(filterSource, />\{`\$\{month\}月`\}<\/button>/)
  assert.match(pageStylesSource, /\.health-events-month-row\s*{[^}]*grid-template-columns:\s*repeat\(12,/s)
  assert.match(pageSource, /getHealthEventDefinitionTitleOptions\(memberEvents\)/)
  assert.match(pageSource, /filters\.definitionTitles\.includes\(event\.definitionTitle\)/)
  assert.doesNotMatch(filterSource, /\['fever', '发烧'\]/)
})
