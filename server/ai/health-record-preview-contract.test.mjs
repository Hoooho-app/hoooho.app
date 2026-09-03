import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberService } from '../members/family-member-service.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { HealthRecordOrganizationService } from './health-record-organization-service.mjs'

const fixedNow = new Date('2026-08-31T08:00:00.000Z')

async function fixture() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-preview-contract-'))
  const accountId = 'account-contract'
  const members = new FamilyMemberService({ dataDirectory })
  const events = new HealthEventService({ dataDirectory })
  const records = new HealthEventRecordService({ dataDirectory })
  const organizations = new HealthRecordOrganizationService({ dataDirectory, structuredMode: 'enabled' })
  const self = await members.createSelf(accountId, { name: '测试照护者' }, fixedNow)
  const child = await members.create(accountId, { name: '测试宝宝', relationship: 'child', gender: 'female', birthday: '2020-01-01' }, fixedNow)
  const childEvent = await events.create(accountId, { memberId: child.id, title: '', category: 'other', startTime: '2026-08-30T09:00:00+08:00' }, fixedNow)
  const otherEvent = await events.create(accountId, { memberId: child.id, title: '', category: 'other', startTime: '2026-08-29T09:00:00+08:00' }, fixedNow)
  return { accountId, child, childEvent, dataDirectory, events, organizations, records, self, otherEvent }
}

function comparable(fact) {
  const { sourceRecordId, organizationRevision, ...value } = fact
  return value
}

test('P0 主体门禁阻止跨人物污染并允许明确当前人物', async () => {
  const context = await fixture()
  try {
    await assert.rejects(
      () => context.organizations.preview(context.accountId, context.childEvent.id, {
        rawInput: '宝宝今天发烧38度5，我自己也有点头疼。',
        selectedOccurredAt: '2026-08-31T15:00:00+08:00', inputChannel: 'text'
      }, fixedNow),
      (error) => error.code === 'MULTIPLE_SUBJECTS_NEED_SPLIT' && /分别记录/.test(error.message)
    )
    await assert.rejects(
      () => context.organizations.preview(context.accountId, context.childEvent.id, {
        rawInput: '我头痛。', selectedOccurredAt: '2026-08-31T15:00:00+08:00'
      }, fixedNow),
      (error) => ['SUBJECT_MEMBER_MISMATCH', 'SUBJECT_NEEDS_CONFIRMATION'].includes(error.code)
    )
    const child = await context.organizations.preview(context.accountId, context.childEvent.id, {
      rawInput: '妈妈说宝宝发烧38.5度。', selectedOccurredAt: '2026-08-31T15:00:00+08:00'
    }, fixedNow)
    assert.equal(child.memberName, '测试宝宝')
    assert.ok(child.healthAIOutput.facts.length >= 2)
    assert.ok(child.healthAIOutput.facts.every((fact) => fact.subjectMemberId === context.child.id))

  } finally {
    await rm(context.dataDirectory, { recursive: true, force: true })
  }
})

test('preview-confirm 单原始记录原子保存完整 facts，刷新一致且确认幂等', async () => {
  const context = await fixture()
  try {
    const preview = await context.organizations.preview(context.accountId, context.childEvent.id, {
      rawInput: '宝宝昨晚23:30右侧小腿严重疼痛两小时，呕吐三次，体温38.5度。',
      selectedOccurredAt: '2026-08-31T15:00:00+08:00', inputChannel: 'text'
    }, fixedNow)
    assert.ok(preview.previewId)
    assert.ok(preview.healthAIOutput.facts.length >= 3)
    const pain = preview.healthAIOutput.facts.find((fact) => fact.bodyPart === '右侧小腿')
    assert.equal(pain?.laterality, 'right')
    assert.equal(pain?.severity, 'severe')
    assert.equal(pain?.duration, '2小时')
    assert.ok(preview.healthAIOutput.facts.some((fact) => fact.name === '呕吐' && fact.occurrenceCount === 3))
    assert.ok(preview.healthAIOutput.facts.every((fact) => !fact.time.raw || fact.time.resolvedStart))

    const first = await context.organizations.confirm(context.accountId, context.childEvent.id, {
      previewId: preview.previewId, idempotencyKey: 'contract-confirm-one'
    }, fixedNow)
    const retry = await context.organizations.confirm(context.accountId, context.childEvent.id, {
      previewId: preview.previewId, idempotencyKey: 'contract-confirm-retry'
    }, fixedNow)
    assert.equal(retry.record.id, first.record.id)
    assert.equal(retry.idempotent, true)
    const records = await context.records.list(context.accountId, context.childEvent.id)
    assert.equal(records.length, 1)
    assert.equal(records[0].content, preview.rawInput)
    assert.equal(records[0].sourceType, 'text_record')
    const refreshed = await context.organizations.list(context.accountId, context.childEvent.id)
    assert.equal(refreshed.length, 1)
    assert.deepEqual(
      refreshed[0].healthAIOutput.facts.map(comparable),
      preview.healthAIOutput.facts.map(comparable)
    )
  } finally {
    await rm(context.dataDirectory, { recursive: true, force: true })
  }
})

test('preview 过期、跨事件、模糊人物与未来时间全部 fail-closed', async () => {
  const context = await fixture()
  try {
    await assert.rejects(
      () => context.organizations.preview(context.accountId, context.childEvent.id, {
        rawInput: '他今天头痛。', selectedOccurredAt: '2026-08-31T15:00:00+08:00'
      }, fixedNow),
      (error) => error.code === 'SUBJECT_NEEDS_CONFIRMATION'
    )
    await assert.rejects(
      () => context.organizations.preview(context.accountId, context.childEvent.id, {
        rawInput: '宝宝今晚20点发烧。', selectedOccurredAt: '2026-08-31T15:00:00+08:00'
      }, fixedNow),
      (error) => error.code === 'FUTURE_OCCURRED_AT'
    )
    const preview = await context.organizations.preview(context.accountId, context.childEvent.id, {
      rawInput: '宝宝昨天咳嗽。', selectedOccurredAt: '2026-08-31T15:00:00+08:00'
    }, fixedNow)
    await assert.rejects(
      () => context.organizations.confirm(context.accountId, context.otherEvent.id, {
        previewId: preview.previewId, idempotencyKey: 'wrong-event-key'
      }, fixedNow),
      (error) => error.code === 'PREVIEW_NOT_FOUND'
    )
    await assert.rejects(
      () => context.organizations.confirm(context.accountId, context.childEvent.id, {
        previewId: preview.previewId, idempotencyKey: 'expired-preview-key'
      }, new Date(fixedNow.getTime() + 16 * 60_000)),
      (error) => error.code === 'PREVIEW_EXPIRED'
    )
  } finally {
    await rm(context.dataDirectory, { recursive: true, force: true })
  }
})

test('历史补录可早于事件首条记录，但未来时间仍由服务端拒绝', async () => {
  const context = await fixture()
  try {
    await context.records.create(context.accountId, context.childEvent.id, {
      type: 'symptom', content: '今天咳嗽', occurredAt: '2026-08-31T14:00:00+08:00'
    }, fixedNow)
    const historical = await context.records.create(context.accountId, context.childEvent.id, {
      type: 'symptom', content: '前天皮疹', occurredAt: '2026-08-29T10:00:00+08:00'
    }, fixedNow)
    assert.equal(historical.occurredAt, '2026-08-29T02:00:00.000Z')
    await assert.rejects(
      () => context.records.create(context.accountId, context.childEvent.id, {
        type: 'symptom', content: '未来发烧', occurredAt: '2026-09-01T10:00:00+08:00'
      }, fixedNow),
      (error) => error.code === 'FUTURE_OCCURRED_AT'
    )
  } finally {
    await rm(context.dataDirectory, { recursive: true, force: true })
  }
})

test('事件级上下文只在唯一症状时关联短句，并保留状态目标', async () => {
  const context = await fixture()
  try {
    const initial = await context.organizations.preview(context.accountId, context.childEvent.id, {
      rawInput: '宝宝咳嗽。', selectedOccurredAt: '2026-08-31T14:00:00+08:00'
    }, fixedNow)
    await context.organizations.confirm(context.accountId, context.childEvent.id, {
      previewId: initial.previewId, idempotencyKey: 'context-initial-key'
    }, fixedNow)
    const persistent = await context.organizations.preview(context.accountId, context.childEvent.id, {
      rawInput: '还在', selectedOccurredAt: '2026-08-31T15:00:00+08:00'
    }, new Date(fixedNow.getTime() + 60_000))
    const change = persistent.healthAIOutput.facts[0]
    assert.equal(change.change, 'persistent')
    assert.equal(change.target, '咳嗽')
    assert.ok(change.targetFactId)

    const second = await context.organizations.preview(context.accountId, context.childEvent.id, {
      rawInput: '宝宝头痛。', selectedOccurredAt: '2026-08-31T15:10:00+08:00'
    }, new Date(fixedNow.getTime() + 120_000))
    await context.organizations.confirm(context.accountId, context.childEvent.id, {
      previewId: second.previewId, idempotencyKey: 'context-second-key'
    }, new Date(fixedNow.getTime() + 120_000))
    await assert.rejects(
      () => context.organizations.preview(context.accountId, context.childEvent.id, {
        rawInput: '轻一点了', selectedOccurredAt: '2026-08-31T15:20:00+08:00'
      }, new Date(fixedNow.getTime() + 180_000)),
      (error) => error.code === 'AMBIGUOUS_HEALTH_CONTEXT'
    )
  } finally {
    await rm(context.dataDirectory, { recursive: true, force: true })
  }
})
