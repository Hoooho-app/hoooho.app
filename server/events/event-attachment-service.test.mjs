import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberService } from '../members/family-member-service.mjs'
import { HealthEventService } from './health-event-service.mjs'
import { EventAttachmentService } from './event-attachment-service.mjs'

test('用户上传的检查图片独立保存并按账号隔离', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-event-attachment-'))
  try {
    const accountId = 'attachment-account'
    const members = new FamilyMemberService({ dataDirectory })
    const events = new HealthEventService({ dataDirectory })
    const attachments = new EventAttachmentService({ dataDirectory })
    const member = await members.create(accountId, { name: '小明', relationship: 'child', gender: 'male', birthday: '2018-08-09' })
    const event = await events.create(accountId, { memberId: member.id, title: '', category: 'other', startTime: '2026-08-09T09:00:00+08:00' })
    const created = await attachments.create(accountId, event.id, {
      name: '血常规.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8='
    })
    assert.equal(created.name, '血常规.png')
    assert.equal((await attachments.list(accountId, event.id)).length, 1)
    await assert.rejects(() => attachments.list('other-account', event.id), (error) => error.code === 'HEALTH_EVENT_NOT_FOUND')
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
