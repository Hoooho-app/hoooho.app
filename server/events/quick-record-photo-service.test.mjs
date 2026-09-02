import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { FamilyMemberService } from '../members/family-member-service.mjs'
import { QuickRecordPhotoService } from './quick-record-photo-service.mjs'

async function imageInput(memberId, sortOrder = 0, color = '#2f8f83') {
  const buffer = await sharp({ create: { width: 18, height: 14, channels: 3, background: color } }).webp().toBuffer()
  return { memberId, sortOrder, name: '体温照片.webp', mimeType: 'image/webp', dataUrl: `data:image/webp;base64,${buffer.toString('base64')}` }
}

async function setup() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-quick-record-photos-'))
  const members = new FamilyMemberService({ dataDirectory })
  const member = await members.create('account-1', { name: '小明', relationship: 'child', gender: 'male', birthday: '2018-08-09' })
  return { dataDirectory, member, service: new QuickRecordPhotoService({ dataDirectory }) }
}

test('照片草稿写入二进制文件且元数据不保存 Base64，并可恢复预览', async () => {
  const state = await setup()
  try {
    const created = await state.service.upload('account-1', 'draft_12345678', await imageInput(state.member.id))
    assert.equal(created.uploadStatus, 'uploaded')
    assert.equal(created.memberId, state.member.id)
    assert.equal('dataUrl' in created, false)
    assert.equal('storageKey' in created, false)
    const metadata = await readFile(path.join(state.dataDirectory, 'quick-record-photo-drafts.json'), 'utf8')
    assert.doesNotMatch(metadata, /base64/)
    assert.equal((await state.service.list('account-1', state.member.id, 'draft_12345678')).length, 1)
    const content = await state.service.read('account-1', state.member.id, 'draft_12345678', created.id)
    assert.equal(content.mimeType, 'image/webp')
    assert.ok(content.buffer.length > 0)
  } finally { await rm(state.dataDirectory, { recursive: true, force: true }) }
})

test('草稿照片执行十张上限、删除和跨账户人物隔离', async () => {
  const state = await setup()
  try {
    const created = []
    for (let index = 0; index < 10; index += 1) created.push(await state.service.upload('account-1', 'draft_abcdefgh', await imageInput(state.member.id, index, `rgb(${index + 1}, 80, 90)`)))
    await assert.rejects(async () => state.service.upload('account-1', 'draft_abcdefgh', await imageInput(state.member.id, 10)), (error) => error.code === 'PHOTO_LIMIT_EXCEEDED')
    const otherMember = await new FamilyMemberService({ dataDirectory: state.dataDirectory }).create('account-1', { name: '小红', relationship: 'child', gender: 'female', birthday: '2020-01-02' })
    await assert.rejects(() => state.service.list('account-2', state.member.id, 'draft_abcdefgh'), (error) => error.code === 'FAMILY_MEMBER_NOT_FOUND')
    await assert.rejects(() => state.service.read('account-1', otherMember.id, 'draft_abcdefgh', created[0].id), (error) => error.code === 'QUICK_RECORD_PHOTO_NOT_FOUND')
    await assert.rejects(() => state.service.delete('account-1', otherMember.id, 'draft_abcdefgh', created[0].id), (error) => error.code === 'QUICK_RECORD_PHOTO_NOT_FOUND')
    await assert.rejects(async () => state.service.upload('account-2', 'draft_other123', await imageInput(state.member.id)), (error) => error.code === 'FAMILY_MEMBER_NOT_FOUND')
    await state.service.delete('account-1', state.member.id, 'draft_abcdefgh', created[4].id)
    const remaining = await state.service.list('account-1', state.member.id, 'draft_abcdefgh')
    assert.equal(remaining.length, 9)
    assert.equal(remaining.some((photo) => photo.id === created[4].id), false)
  } finally { await rm(state.dataDirectory, { recursive: true, force: true }) }
})

test('确认保存准备严格保持照片顺序并拒绝其他人物照片', async () => {
  const state = await setup()
  try {
    const first = await state.service.upload('account-1', 'draft_order123', await imageInput(state.member.id, 4, '#123456'))
    const second = await state.service.upload('account-1', 'draft_order123', await imageInput(state.member.id, 2, '#654321'))
    const prepared = await state.service.prepareForSave('account-1', state.member.id, 'draft_order123', [second.id, first.id])
    assert.deepEqual(prepared.map((photo) => photo.id), [second.id, first.id])
    assert.deepEqual(prepared.map((photo) => photo.sortOrder), [0, 1])
    await assert.rejects(() => state.service.prepareForSave('account-1', 'another-member', 'draft_order123', [first.id]), (error) => error.code === 'PHOTOS_NOT_READY')
  } finally { await rm(state.dataDirectory, { recursive: true, force: true }) }
})

test('照片确认后以账号、人物、随记和记录元数据关联且仍不写入 Base64', async () => {
  const state = await setup()
  try {
    const created = await state.service.upload('account-1', 'draft_attach123', await imageInput(state.member.id))
    const prepared = await state.service.prepareForSave('account-1', state.member.id, 'draft_attach123', [created.id])
    const attached = await state.service.attach('account-1', 'event-1', 'record-1', state.member.id, prepared)
    await state.service.consume('account-1', 'draft_attach123', prepared)
    assert.equal(attached.length, 1)
    assert.deepEqual({
      accountId: attached[0].accountId,
      memberId: attached[0].memberId,
      eventId: attached[0].eventId,
      recordId: attached[0].recordId,
      sortOrder: attached[0].sortOrder,
      uploadStatus: attached[0].uploadStatus
    }, { accountId: 'account-1', memberId: state.member.id, eventId: 'event-1', recordId: 'record-1', sortOrder: 0, uploadStatus: 'uploaded' })
    const metadata = await readFile(path.join(state.dataDirectory, 'event-attachments.json'), 'utf8')
    assert.doesNotMatch(metadata, /base64/)
    assert.equal((await state.service.list('account-1', state.member.id, 'draft_attach123')).length, 0)
  } finally { await rm(state.dataDirectory, { recursive: true, force: true }) }
})
