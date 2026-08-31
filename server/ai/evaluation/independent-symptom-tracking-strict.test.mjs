import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { independentSymptomTrackingCases } from '../../../scripts/independent-symptom-tracking-expectations.mjs'
import { FamilyMemberService } from '../../members/family-member-service.mjs'
import { HealthEventService } from '../../events/health-event-service.mjs'
import { HealthRecordOrganizationService } from '../health-record-organization-service.mjs'

const referenceNow = new Date('2026-08-31T15:59:00.000Z')
const selectedOccurredAt = '2026-08-31T23:58:55+08:00'
const timezone = 'Asia/Shanghai'

const namePatterns = {
  '咳嗽': /咳/u, '疼痛': /疼|痛/u, '头痛': /头痛|头疼/u, '腹痛': /腹痛|肚子疼|腹部疼/u,
  '皮疹': /皮疹|红疹|疹子/u, '喘息': /喘/u, '体温': /体温|温度/u, '鼻塞': /鼻塞|鼻子堵/u,
  '咽喉痛': /咽|喉|嗓/u, '发热': /发热|发烧|烧/u, '麻木': /麻/u, '呕吐': /呕吐|吐/u,
  '头晕': /头晕/u, '恶心': /恶心/u, '流鼻涕': /流鼻涕|鼻涕/u, '腹泻': /腹泻|拉肚子/u,
  '肺炎': /肺炎/u, '焦虑': /焦虑|急死/u, '辱骂': /辱骂|妈的/u
}

function searchText(fact) {
  return [fact?.name, fact?.concept, fact?.target, fact?.bodyPart, fact?.bodyRegion].filter(Boolean).join(' ')
}

function includesNormalized(actual, expected) {
  if (actual === undefined || actual === null) return false
  const actualText = String(actual).toLowerCase().replaceAll(/\s+/g, '')
  const expectedText = String(expected).toLowerCase().replaceAll(/\s+/g, '')
  if (actualText.includes(expectedText) || expectedText.includes(actualText)) return true
  const aliases = {
    '腹部': /腹|肚/u, '小腿': /小腿|腿/u, '肩': /肩/u, '咽喉': /咽|喉|嗓/u,
    '胳膊': /胳膊|手臂|上肢/u, '右下腹': /右下腹/u, '肚脐周围': /肚脐|脐周/u,
    '2小时': /2小时|两个小时|PT2H/i, '3天': /3天|三天|P3D/i,
    occasional: /occasional|偶尔/u, frequent: /frequent|频繁/u, '晚上': /晚上|夜间|每天晚上/u,
    '每天晚上': /每天晚上|夜间/u, '白天': /白天/u, '跑步': /跑步|运动/u, '不跑': /不跑|静息/u, '几分钟': /几分钟/u
  }
  return aliases[expected]?.test(String(actual)) || false
}

function localParts(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

function missingFields(actual, expected, memberId) {
  const missing = []
  const labelMatches = expected.type === 'temperature' && expected.name === '体温' && actual?.type === 'temperature'
    || expected.type === 'status_change' && actual?.type === 'status_change'
      && (!expected.change || actual?.change === expected.change)
      && (!expected.target || includesNormalized(actual?.target, expected.target))
  const pattern = namePatterns[expected.name] || new RegExp(expected.name, 'u')
  if (expected.name && !labelMatches && !pattern.test(searchText(actual))) missing.push(`name=${expected.name}`)
  for (const key of ['type', 'polarity', 'severity', 'change']) {
    if (expected[key] !== undefined && actual?.[key] !== expected[key]) missing.push(`${key}=${expected[key]}`)
  }
  if (expected.status && actual?.status !== expected.status && actual?.change !== expected.status) missing.push(`status=${expected.status}`)
  for (const key of ['target', 'bodyPart', 'laterality', 'severityScale', 'frequency', 'duration']) {
    const actualValue = key === 'bodyPart' ? actual?.bodyPart || actual?.bodyRegion : actual?.[key]
    if (expected[key] !== undefined && !includesNormalized(actualValue, expected[key])) missing.push(`${key}=${expected[key]}`)
  }
  if (expected.occurrenceCount !== undefined && Number(actual?.occurrenceCount ?? actual?.count) !== expected.occurrenceCount) missing.push(`occurrenceCount=${expected.occurrenceCount}`)
  const actualMin = Number(actual?.temperature?.min ?? actual?.value)
  const actualMax = Number(actual?.temperature?.max ?? actual?.value)
  if (expected.temperatureMin !== undefined && Math.abs(actualMin - expected.temperatureMin) > 0.001) missing.push(`temperatureMin=${expected.temperatureMin}`)
  if (expected.temperatureMax !== undefined && Math.abs(actualMax - expected.temperatureMax) > 0.001) missing.push(`temperatureMax=${expected.temperatureMax}`)
  if (expected.timeRaw && !includesNormalized(actual?.time?.raw, expected.timeRaw)) missing.push(`timeRaw=${expected.timeRaw}`)
  if (expected.timePrecision && actual?.time?.precision !== expected.timePrecision) missing.push(`timePrecision=${expected.timePrecision}`)
  const parts = localParts(actual?.time?.resolvedStart)
  if (expected.resolvedDate && `${parts?.year}-${parts?.month}-${parts?.day}` !== expected.resolvedDate) missing.push(`resolvedDate=${expected.resolvedDate}`)
  if (expected.resolvedHour !== undefined && Number(parts?.hour) !== expected.resolvedHour) missing.push(`resolvedHour=${expected.resolvedHour}`)
  if (expected.resolvedMinute !== undefined && Number(parts?.minute) !== expected.resolvedMinute) missing.push(`resolvedMinute=${expected.resolvedMinute}`)
  if (expected.resolvedNearNowMinutes !== undefined) {
    const distance = Math.abs(referenceNow.getTime() - new Date(actual?.time?.resolvedStart).getTime()) / 60_000
    if (!Number.isFinite(distance) || distance > expected.resolvedNearNowMinutes) missing.push(`nearNow=${expected.resolvedNearNowMinutes}`)
  }
  if (expected.relation && !(actual?.supersedesFactId || actual?.revisionOfFactId || actual?.targetFactId)) missing.push('relation=true')
  if (expected.current === true && ['corrected', 'superseded'].includes(actual?.status)) missing.push('current=true')
  if (expected.subjectText && !includesNormalized(actual?.subjectText, expected.subjectText)) missing.push(`subjectText=${expected.subjectText}`)
  if (memberId && actual?.subjectMemberId !== memberId) missing.push('subjectMemberId')
  return missing
}

function evaluateFacts(facts, expectation, memberId) {
  const used = new Set()
  const failures = []
  for (const expected of expectation.facts) {
    let best = null
    for (let index = 0; index < facts.length; index += 1) {
      if (used.has(index)) continue
      const missing = missingFields(facts[index], expected, memberId)
      if (!best || missing.length < best.missing.length) best = { index, missing, actual: facts[index] }
      if (!missing.length) break
    }
    if (!best || best.missing.length) failures.push({ expected, actual: best?.actual, missing: best?.missing ?? ['no fact'] })
    else used.add(best.index)
  }
  const forbidden = (expectation.forbidden ?? []).flatMap((expected) => facts.filter((actual) => !missingFields(actual, expected, null).length))
  if (facts.length < expectation.minFacts || facts.length > expectation.maxFacts) failures.push({ count: facts.length, expectedCount: [expectation.minFacts, expectation.maxFacts] })
  if (forbidden.length) failures.push({ forbidden })
  return failures
}

test('独立验收 65 例的预览、确认和刷新事实严格一致', async (suite) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-independent-strict-'))
  const accountId = 'account-independent-strict'
  try {
    const members = new FamilyMemberService({ dataDirectory })
    const events = new HealthEventService({ dataDirectory })
    const organizations = new HealthRecordOrganizationService({ dataDirectory, structuredMode: 'enabled' })
    const memberByKind = {
      self: await members.createSelf(accountId, { name: '测试成人B' }, referenceNow),
      child: await members.create(accountId, { name: '测试宝宝A', relationship: 'child', gender: 'female', birthday: '2020-01-01' }, referenceNow),
      senior: await members.create(accountId, { name: '测试老人C', relationship: 'parent', gender: 'male', birthday: '1950-01-01' }, referenceNow)
    }
    for (const [caseIndex, item] of independentSymptomTrackingCases.entries()) {
      await suite.test(item.id, async () => {
        const member = memberByKind[item.member]
        const event = await events.create(accountId, { memberId: member.id, title: '', category: 'other', startTime: '2026-08-01T00:00:00+08:00' }, referenceNow)
        for (const [stepIndex, rawInput] of item.executionSteps.entries()) {
          const expected = item.expectedSteps[stepIndex]
          let preview = null
          let thrown = null
          try {
            preview = await organizations.preview(accountId, event.id, { rawInput, selectedOccurredAt, inputChannel: 'text', timezone }, referenceNow)
          } catch (error) {
            thrown = error
          }
          if (expected.reject) {
            assert.ok(thrown || (!preview?.previewId && !(preview?.healthAIOutput?.facts?.length)), `${item.id} step ${stepIndex + 1} should reject`)
            continue
          }
          assert.ifError(thrown)
          assert.ok(preview?.previewId, `${item.id} step ${stepIndex + 1} missing previewId`)
          const previewFailures = evaluateFacts(preview.healthAIOutput.facts, expected, member.id)
          if (previewFailures.length) throw new Error(`${item.id} step ${stepIndex + 1}: ${JSON.stringify(previewFailures.map((failure) => ({ missing: failure.missing, count: failure.count, expectedCount: failure.expectedCount, actual: failure.actual && { type: failure.actual.type, name: failure.actual.name, target: failure.actual.target, bodyPart: failure.actual.bodyPart, laterality: failure.actual.laterality, polarity: failure.actual.polarity, status: failure.actual.status, change: failure.actual.change, severity: failure.actual.severity, severityScale: failure.actual.severityScale, frequency: failure.actual.frequency, occurrenceCount: failure.actual.occurrenceCount, duration: failure.actual.duration, time: failure.actual.time } })))} `)
          const confirmed = await organizations.confirm(accountId, event.id, {
            previewId: preview.previewId,
            idempotencyKey: `strict-${caseIndex}-${stepIndex}`
          }, referenceNow)
          assert.deepEqual(evaluateFacts(confirmed.organization.healthAIOutput.facts, expected, member.id), [])
          const refreshed = await organizations.list(accountId, event.id)
          const saved = refreshed.find((item) => item.id === confirmed.organization.id)
          assert.deepEqual(evaluateFacts(saved.healthAIOutput.facts, expected, member.id), [])
        }
      })
    }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
