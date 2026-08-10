import assert from 'node:assert/strict'
import test from 'node:test'
import { AIService } from './ai-service.mjs'
import { TimeResolverService } from './time-resolver-service.mjs'
import { TimeContextResolver } from './time-context-resolver.mjs'

const resolver = new TimeResolverService()
const contextResolver = new TimeContextResolver({ timeResolver: resolver })
const context = { referenceNow: new Date('2026-08-10T04:00:00.000Z'), timezone: 'Asia/Shanghai' }

test('Time Resolver 解析明确、相对与模糊时间，并检测选择时间冲突', () => {
  const morning = resolver.resolve('今天早上', context)
  assert.equal(morning.precision, 'period')
  assert.equal(morning.resolvedStart, '2026-08-10T06:00:00+08:00')
  assert.equal(morning.resolvedEnd, '2026-08-10T09:00:00+08:00')

  const lastNight = resolver.resolve('昨天晚上', context)
  assert.equal(lastNight.precision, 'period')
  assert.equal(lastNight.resolvedStart, '2026-08-09T18:00:00+08:00')
  assert.equal(lastNight.resolvedEnd, '2026-08-10T00:00:00+08:00')

  const exactDate = resolver.resolve('2024年5月10日', context)
  assert.equal(exactDate.precision, 'exact')
  assert.equal(exactDate.resolvedStart, '2024-05-10T00:00:00+08:00')

  const year = resolver.resolve('2020年', context)
  assert.equal(year.precision, 'year')
  assert.equal(year.resolvedStart, '2020-01-01T00:00:00+08:00')
  assert.equal(year.resolvedEnd, '2020-12-31T23:59:59+08:00')

  const fuzzy = resolver.resolve('小时候', context)
  assert.equal(fuzzy.precision, 'fuzzy')
  assert.equal(fuzzy.resolvedStart, null)
  assert.equal(fuzzy.resolvedEnd, null)

  const missing = resolver.resolve(null, context)
  assert.equal(missing.precision, 'unknown')
  assert.equal(missing.resolvedStart, null)
  assert.equal(missing.resolvedEnd, null)

  const resolvedOutput = resolver.resolveHealthAIOutput({
    facts: [{ type: 'symptom', name: '胃痛', time: { raw: '2004年' } }]
  }, { ...context, selectedOccurredAt: '2005年' })
  assert.equal(resolvedOutput.timeConflict.hasConflict, true)
  assert.deepEqual(resolvedOutput.timeConflict.conflict, {
    type: 'time_conflict', selected: '2005年', mentioned: '2004年'
  })
  assert.equal(resolvedOutput.facts[0].time.resolvedStart, '2004-01-01T00:00:00+08:00')
})

test('Time Resolver 集成到 HealthFact，并且不为缺失时间编造结果', async () => {
  const ai = new AIService({ primaryProvider: false, timeResolver: resolver })

  const morning = await ai.organizeHealthRecord('今天早上头痛', context)
  const headache = morning.healthAIOutput.facts.find((fact) => fact.type === 'symptom' && fact.name === '头痛')
  assert.equal(headache.time.raw, '今天早上')
  assert.equal(headache.time.resolvedStart, '2026-08-10T06:00:00+08:00')
  assert.equal(headache.time.source, 'user_text')

  const lastNight = await ai.organizeHealthRecord('昨天晚上发烧', context)
  const fever = lastNight.healthAIOutput.facts.find((fact) => fact.type === 'symptom' && fact.name === '发热')
  assert.equal(fever.time.resolvedStart, '2026-08-09T18:00:00+08:00')

  const conflict = await ai.organizeHealthRecord('2004年胃痛', { ...context, selectedOccurredAt: '2005年' })
  assert.equal(conflict.healthAIOutput.timeConflict.hasConflict, true)

  const childhood = await ai.organizeHealthRecord('小时候哮喘', context)
  const asthma = childhood.healthAIOutput.facts.find((fact) => fact.name === '哮喘')
  assert.equal(asthma.time.precision, 'fuzzy')
  assert.equal(asthma.time.resolvedStart, null)

  const missing = await ai.organizeHealthRecord('头痛', context)
  const untimedHeadache = missing.healthAIOutput.facts.find((fact) => fact.name === '头痛')
  assert.equal(untimedHeadache.time.raw, null)
  assert.equal(untimedHeadache.time.resolvedStart, null)
  assert.equal(untimedHeadache.time.precision, 'unknown')
})

test('Time Context Resolver 继承日期并解析连续相对时间', () => {
  const crossDay = contextResolver.resolveContexts('昨天晚上发烧，今天早上退了一点', context)
  assert.equal(crossDay[0].time.resolvedStart, '2026-08-09T18:00:00+08:00')
  assert.equal(crossDay[1].time.resolvedStart, '2026-08-10T06:00:00+08:00')

  const inheritedDate = contextResolver.resolveContexts('昨天下午发烧，晚上38.8度', context)
  assert.equal(inheritedDate[0].time.resolvedStart, '2026-08-09T14:00:00+08:00')
  assert.equal(inheritedDate[1].time.resolvedStart, '2026-08-09T18:00:00+08:00')

  const nextDay = contextResolver.resolveContexts('上周三晚上腹痛，第二天检查', context)
  assert.equal(nextDay[0].time.resolvedStart, '2026-08-05T18:00:00+08:00')
  assert.equal(nextDay[1].time.resolvedStart, '2026-08-06T00:00:00+08:00')

  const weekdays = contextResolver.resolveContexts('周一开始咳嗽，周三加重', context)
  assert.equal(weekdays[0].time.resolvedStart, '2026-08-10T00:00:00+08:00')
  assert.equal(weekdays[1].time.resolvedStart, '2026-08-12T00:00:00+08:00')
})
