import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

let directory: string
let components: Record<string, any>
before(async () => {
  await mkdir(path.resolve('.codex-tmp'), { recursive: true })
  directory = await mkdtemp(path.resolve('.codex-tmp/statistics-render-'))
  const entry = path.join(directory, 'entry.mjs')
  const result = await build({
    stdin: { contents: `export { OpsPage } from './src/pages/Ops/index.tsx'; export { GrowthRecordsPage } from './src/pages/HealthProfile/GrowthRecordsPage.tsx'; export { MedicationReminderCard } from './src/pages/NurseStation/MedicationReminderCard.tsx';`, resolveDir: process.cwd() },
    bundle: true, packages: 'external', platform: 'node', format: 'esm', jsx: 'automatic', write: false, outfile: entry,
    loader: { '.css': 'empty' },
    plugins: [{ name: 'non-business-assets', setup(builder) {
      builder.onResolve({ filter: /\.(svg|png|jpg|webp|mp4)(\?.*)?$/ }, args => ({ path: args.path, namespace: 'test-asset' }))
      builder.onLoad({ filter: /.*/, namespace: 'test-asset' }, () => ({ contents: 'export default ""', loader: 'js' }))
    } }],
  })
  await writeFile(entry, result.outputFiles[0].contents)
  components = await import(pathToFileURL(entry).href)
})
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })

test('growth loading render does not claim zero saved records', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(components.GrowthRecordsPage)))
  assert.match(html, /正在加载成长记录/)
  assert.doesNotMatch(html, /共\s*0\s*条成长记录/)
})

test('billing overview renders unknown counts until a successful response', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(components.OpsPage)))
  const summary = html.slice(html.indexOf('aria-label="更新概览"'), html.indexOf('ops-sources-section'))
  assert.equal((summary.match(/—/g) ?? []).length, 4)
  assert.doesNotMatch(summary, />0</)
})

test('medication card renders today plan progress separately from historical doses recorded today', () => {
  const now = new Date('2026-10-06T02:00:00+08:00')
  const completions = [1, 2, 3].map(index => ({ id: `c${index}`, occurrenceId: `old${index}`, scheduledAt: `2026-10-0${index}T00:00:00Z`, actualTakenAt: now.toISOString(), undoneAt: null }))
  const current = { id: 'today', day: '2026-10-06', scheduledAt: '2026-10-06T00:00:00Z', completed: false, weekIndex: 0, slotIndex: 0 }
  const reminder = { id: 'reminder', status: 'active', totalDays: 7, plan: { medicationName: '测试药品', medicationType: 'tablet', amount: 1, unit: '片', route: 'oral', mode: 'daily', times: ['08:00'], startDate: '2026-10-01', timezone: 'Asia/Shanghai' }, completions, occurrences: [...completions.map((completion, index) => ({ id: completion.occurrenceId, day: `2026-10-0${index + 1}`, scheduledAt: completion.scheduledAt, completed: true, completion, weekIndex: 0, slotIndex: 0 })), current], nextOccurrence: current }
  const html = renderToStaticMarkup(createElement(components.MedicationReminderCard, { reminder, now, open: false, busy: false, onOpen() {}, onTake() {}, onUndo() {}, onArchive() {}, onDelete() {} }))
  assert.match(html, /今日计划：<strong[^>]*>0<\/strong><span>\/1<\/span>/)
  assert.match(html, /按实际服用时间：今日 3 次/)
  assert.doesNotMatch(html, /今日计划：<strong[^>]*>3<\/strong>/)
})
