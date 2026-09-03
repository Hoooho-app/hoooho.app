import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberService } from '../../members/family-member-service.mjs'
import { HealthEventService } from '../../events/health-event-service.mjs'
import { HealthRecordOrganizationService } from '../health-record-organization-service.mjs'
import { symptomTracking65Cases } from './symptom-tracking-65-cases.mjs'

const fixedNow = new Date('2026-08-31T15:59:00.000Z')
const selectedOccurredAt = '2026-08-31T23:30:00+08:00'

function comparable(fact) {
  const { sourceRecordId, organizationRevision, ...value } = fact
  return value
}

test('原 65 个症状跟踪正式用例形成可重复服务端回归集', async (suite) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-symptom-65-'))
  const accountId = 'account-symptom-65'
  try {
    const members = new FamilyMemberService({ dataDirectory })
    const events = new HealthEventService({ dataDirectory })
    const organizations = new HealthRecordOrganizationService({ dataDirectory, structuredMode: 'enabled' })
    const memberByKind = {
      self: await members.createSelf(accountId, { name: '测试成人B' }, fixedNow),
      child: await members.create(accountId, { name: '测试宝宝A', relationship: 'child', gender: 'female', birthday: '2020-01-01' }, fixedNow),
      senior: await members.create(accountId, { name: '测试老人C', relationship: 'parent', gender: 'male', birthday: '1950-01-01' }, fixedNow)
    }
    assert.equal(symptomTracking65Cases.length, 65)
    for (const [caseIndex, item] of symptomTracking65Cases.entries()) {
      await suite.test(item.id, async () => {
        if (item.expectation === 'interaction') {
          assert.equal(item.id, 'UI-06')
          return
        }
        const member = memberByKind[item.member]
        const event = await events.create(accountId, {
          memberId: member.id, title: '', category: 'other', startTime: '2026-08-01T00:00:00+08:00'
        }, fixedNow)
        let confirmed = 0
        for (const [stepIndex, rawInput] of item.steps.entries()) {
          const call = () => organizations.preview(accountId, event.id, {
            rawInput, selectedOccurredAt, inputChannel: 'text', timezone: 'Asia/Shanghai'
          }, fixedNow)
          if (item.expectation === 'multiple_subjects') {
            await assert.rejects(call, (error) => error.code === 'MULTIPLE_SUBJECTS_NEED_SPLIT')
            continue
          }
          if (item.expectation === 'subject_mismatch') {
            await assert.rejects(call, (error) => error.code === 'SUBJECT_MEMBER_MISMATCH')
            continue
          }
          if (item.expectation === 'ambiguous') {
            await assert.rejects(call, (error) => error.code === 'AMBIGUOUS_HEALTH_CONTEXT')
            continue
          }
          if (item.expectation === 'last_reject' && stepIndex === item.steps.length - 1) {
            await assert.rejects(call, (error) => error.code === 'AMBIGUOUS_HEALTH_CONTEXT')
            continue
          }
          const preview = await call()
          if (item.expectation === 'zero') {
            assert.equal(preview.hasHealthFacts, false)
            assert.equal(preview.previewId, undefined)
            continue
          }
          assert.equal(preview.hasHealthFacts, true, `${item.id} step ${stepIndex + 1}: ${rawInput}`)
          assert.ok(preview.previewId)
          assert.ok(preview.healthAIOutput.facts.length > 0)
          assert.ok(preview.healthAIOutput.facts.every((fact) => fact.subjectMemberId === member.id))
          const result = await organizations.confirm(accountId, event.id, {
            previewId: preview.previewId,
            idempotencyKey: `case-${String(caseIndex).padStart(2, '0')}-step-${String(stepIndex).padStart(2, '0')}`
          }, fixedNow)
          assert.deepEqual(
            result.organization.healthAIOutput.facts.map(comparable),
            preview.healthAIOutput.facts.map(comparable)
          )
          confirmed += 1
        }
        const refreshed = await organizations.list(accountId, event.id)
        assert.equal(refreshed.length, confirmed)
      })
    }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
