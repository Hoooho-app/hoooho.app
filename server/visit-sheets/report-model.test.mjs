import assert from 'node:assert/strict'
import test from 'node:test'
import { buildVisitSheet } from './report-model.mjs'
import { visitFixture } from './fixtures.mjs'
const now = new Date('2026-09-26T00:00:00Z'),
  chapter = (r, id) => r.chapters.find((c) => c.id === id)
test('自动主诉按发生时间，忽略碎片、用药和新补录时间', () => {
  const f = visitFixture()
  f.records[0].createdAt = '2026-09-26T00:00:00Z'
  f.records[0].updatedAt = f.records[0].createdAt
  const r = buildVisitSheet(f, {}, now)
  assert.equal(r.complaintSourceId, 'record:s7')
  assert.equal(r.candidates.length, 8)
  assert.equal(r.chapters.length, 9)
  assert.equal(r.chapters[0].title, '病情数据')
})
test('主诉同步改变分母、病程和引用，其他来源保留，自填无匹配不套旧图', () => {
  const f = visitFixture(),
    a = buildVisitSheet(f, {}, now),
    b = buildVisitSheet(
      f,
      { focus: { mode: 'source', sourceId: 'record:s0' } },
      now,
    )
  assert.equal(b.focusSourceIds.length, 2)
  assert.equal(a.focusSourceIds.length, 6)
  assert.equal(chapter(b, 'course').blocks.length, 2)
  assert.equal(
    chapter(b, 'overview').blocks[1].distribution.reduce(
      (n, c) => n + c.count,
      0,
    ),
    2,
  )
  assert.equal(a.sources.length, b.sources.length)
  const custom = buildVisitSheet(
    f,
    { focus: { mode: 'custom', text: '没有匹配的问题' } },
    now,
  )
  assert.equal(custom.focusSourceIds.length, 0)
  assert.equal(chapter(custom, 'course').blocks.length, 0)
  assert.ok(!chapter(custom, 'overview').blocks.some((b) => b.distribution))
  assert.equal(custom.sources.length, a.sources.length)
})
test('过程ID聚合、未知保留、未来用药节点排除、同一次执行不重复', () => {
  const f = visitFixture(),
    r = buildVisitSheet(f, {}, now)
  assert.deepEqual(
    chapter(r, 'allergy').blocks[0].distribution.map((v) => v.count),
    [2, 2, 1],
  )
  assert.deepEqual(
    chapter(r, 'medication').blocks[0].distribution.map((v) => v.count),
    [5, 2],
  )
  assert.ok(
    !chapter(r, 'medication').blocks.some((b) => b.title === '独立服用记录'),
  )
  assert.ok(
    chapter(r, 'medication').blocks.some((b) => b.title.includes('未来')),
  )
  f.tasks.push({ ...f.tasks[0], id: 'task2', records: [] })
  assert.equal(chapter(buildVisitSheet(f, {}, now), 'allergy').blocks.length, 2)
})
test('体温同日多点、成长分图、0值保留、附件不计症状', () => {
  const f = visitFixture()
  f.growth[0].weightKg = 0
  const r = buildVisitSheet(f, {}, now)
  assert.equal(chapter(r, 'temperature').blocks[0].points.length, 3)
  assert.equal(
    chapter(r, 'growth').blocks.find((b) => b.title === '体重').points[0].value,
    0,
  )
  assert.equal(chapter(r, 'growth').blocks.filter((b) => b.points).length, 2)
  assert.equal(r.candidates.length, 8)
})
test('空、少资料和部分失败不补造统计', () => {
  const f = visitFixture()
  for (const k of [
    'events',
    'records',
    'growth',
    'reminders',
    'tasks',
    'attachments',
  ])
    f[k] = []
  f.warnings = ['附件读取失败']
  const r = buildVisitSheet(f, {}, now)
  assert.equal(r.sources.length, 0)
  assert.equal(r.chapters.length, 9)
  assert.equal(r.warnings[0], '附件读取失败')
  assert.equal(r.complaintSourceId, null)
  f.records = [
    {
      id: 'single',
      eventId: 'event-a',
      type: 'symptom',
      content: '肘窝发红',
      occurredAt: '2026-09-20T00:00:00Z',
    },
  ]
  assert.equal(buildVisitSheet(f, {}, now).focusSourceIds.length, 1)
})
test('兼容已保存结构化体温，原始文本与更正内容均可追溯', () => {
  const f = visitFixture()
  f.records[0].sourceText = '最早原文'
  f.organizations = [
    {
      recordId: 'noise',
      healthAIOutput: {
        facts: [
          {
            type: 'temperature',
            temperature: { min: 38, max: 38 },
            time: { resolvedStart: '2026-09-25T13:00:00Z' },
          },
        ],
      },
    },
  ]
  const r = buildVisitSheet(f, {}, now)
  assert.equal(chapter(r, 'temperature').blocks[0].points.length, 4)
  assert.match(r.sources.find((s) => s.id === 'record:s0').text, /最早原文/)
})
