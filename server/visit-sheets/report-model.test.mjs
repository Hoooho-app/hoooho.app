import assert from 'node:assert/strict'
import test from 'node:test'
import { buildVisitSheet } from './report-model.mjs'
import { visitFixture } from './fixtures.mjs'
const now = new Date('2026-09-26T00:00:00Z'),
  chapter = (r, id) => r.chapters.find((c) => c.id === id)

function temperatureFixture(content, facts) {
  const input = visitFixture()
  input.records = [{ id: 'temp', accountId: 'visit-test', eventId: 'event-a', type: 'note', sourceType: 'measurement', content, occurredAt: '2026-09-20T08:00:00Z', updatedAt: '2026-09-20T12:00:00Z' }]
  input.organizations = facts ? [{ recordId: 'temp', sourceRecordUpdatedAt: input.records[0].updatedAt, healthAIOutput: { facts } }] : []
  return input
}
const temperatureFact = (value, at) => ({ type: 'temperature', polarity: 'affirmed', subject: 'event_subject', temporality: 'current', temperature: { min: value, max: value }, time: { resolvedStart: at } })

test('温度区间与模糊数值保留原文，不升级为单次实测', () => {
  for (const content of ['体温36.8～37.2℃', '体温36.8℃–37.2℃', '体温36.8-37.2℃', '体温约37℃', '如果体温38℃', '没有体温38℃']) {
    const result = buildVisitSheet(temperatureFixture(content), {}, now)
    assert.equal(chapter(result, 'temperature').blocks.length, 0, content)
    assert.ok(result.sources.some(source => source.text.includes(content)), content)
  }
})

test('同条记录的多个已整理体温点按实际时间计算最近值，不重复统计原文', () => {
  const input = temperatureFixture('08:00体温38.5℃，10:00体温37.0℃', [temperatureFact(38.5, '2026-09-20T08:00:00Z'), temperatureFact(37, '2026-09-20T10:00:00Z')])
  const temperature = chapter(buildVisitSheet(input, {}, now), 'temperature')
  assert.deepEqual(temperature.blocks.flatMap(block => block.points).map(point => point.value), [38.5, 37])
  assert.match(temperature.overview.items[0].title, /最近 37 ℃/)
  assert.match(temperature.overview.items[0].detail, /2 次/)
})

test('结构化更正优先于原文；区间与否定事实不能回退到原文造出实测', () => {
  const input = temperatureFixture('体温38.5℃', [temperatureFact(38.5, '2026-09-20T08:00:00Z')])
  input.records[0].journal = { symptom: { symptomSpecificData: { currentTemperature: 37.1 } } }
  assert.deepEqual(chapter(buildVisitSheet(input, {}, now), 'temperature').blocks[0].points.map(point => point.value), [37.1])
  delete input.records[0].journal
  input.organizations[0].healthAIOutput.facts[0].polarity = 'negated'
  assert.equal(chapter(buildVisitSheet(input, {}, now), 'temperature').blocks.length, 0)
  input.organizations[0].healthAIOutput.facts = [{ ...temperatureFact(37, '2026-09-20T08:00:00Z'), temperature: { min: 36.8, max: 37.2 } }]
  assert.equal(chapter(buildVisitSheet(input, {}, now), 'temperature').blocks.length, 0)
})

test('明确资料范围仅纳入所选情况与时间，AI参考保留来源但不升级医生判断', () => {
  const f=visitFixture(), id=f.events[0].id, originals=f.records.filter(r=>r.eventId===id)
  const reference={...originals[0],id:'external-reference',content:'合成AI参考，不是医生建议',caseContext:{identity:'external_ai',confirmed:true,attachmentIds:[]}}
  f.records.push(reference)
  const selection={eventIds:[id],includeBackground:false}
  const report=buildVisitSheet(f,{selection},now)
  assert.deepEqual(report.selection,selection)
  const recordSources=report.sources.filter(s=>s.recordId)
  assert.ok(recordSources.every(s=>s.eventId===id))
  assert.equal(report.sources.find(s=>s.recordId==='external-reference').category,'sources')
  assert.ok(!report.sources.some(s=>s.type==='growth'))
  const none=buildVisitSheet(f,{selection:{...selection,from:'2026-09-26T00:00:00Z'}},now)
  assert.equal(none.sources.filter(s=>s.recordId).length,0)
})
test('visit sheet and sources display reliable anatomical names without mutating legacy snapshots',()=>{
  const fixture=visitFixture()
  const original={id:'head_crown',label:'头顶3号区域',locationNumber:1,locationLayer:'surface',markedArea:'legacy x=12,y=34'}
  fixture.records[7].journal.symptom.locations=[original]
  const result=buildVisitSheet(fixture,{},now)
  const source=result.sources.find(s=>s.id==='record:s7')
  assert.deepEqual(source.locations,['头顶'])
  assert.equal(original.label,'头顶3号区域');assert.equal(original.markedArea,'legacy x=12,y=34')
  assert.ok(result.chapters.flatMap(c=>c.blocks??[]).some(b=>b.locations?.includes('头顶')))
})
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
  assert.equal(chapter(b, 'course').blocks.filter(b=>!b.distribution).length, 2)
  assert.equal(
    chapter(b, 'course').blocks.find(b=>b.distribution).distribution.reduce(
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
