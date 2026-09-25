import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { RoutineService } from './routine-service.mjs'

async function fixture() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-routines-'))
  const members = new FamilyMemberRepository(dataDirectory)
  const member = await members.create({ accountId: 'account-1', name: '安安', relationship: 'child' })
  const calls = []
  const recordMap = new Map()
  const eventMap = new Map()
  const records = { repository: { findByAccountId: async () => [...recordMap.values()], findById: async (id) => recordMap.get(id) ?? null } }
  const events = { repository: { findById: async (id) => eventMap.get(id) ?? null } }
  const quickRecords = { records, events, create: async (_accountId, input) => { calls.push(input); const record = { id: 'record-1', accountId: 'account-1', eventId: 'event-1', occurredAt: input.occurredAt, content: input.content, journal: input.journal }; recordMap.set(record.id, record); eventMap.set('event-1', { id: 'event-1', accountId: 'account-1', memberId: member.id }); return { eventId: 'event-1', recordId: record.id, idempotent: false } } }
  return { service: new RoutineService({ dataDirectory, members, quickRecords, records, events }), member, members, calls, recordMap, eventMap }
}

test('routine versions are day-scoped, idempotent and not backfilled before consent', async () => {
  const { service, member } = await fixture()
  await service.saveTemplateVersion('account-1', member.id, { effectiveFrom: '2026-09-22', items: { breakfast: { enabled: true, time: '08:10', endTime: '08:40' } } }, new Date('2026-09-22T00:00:00Z'))
  assert.equal((await service.getDay('account-1', member.id, '2026-09-21')).tracks.length, 0)
  assert.equal((await service.getDay('account-1', member.id, '2026-09-22')).tracks[0].time, '08:10')
  await service.saveTemplateVersion('account-1', member.id, { effectiveFrom: '2026-09-23', items: { breakfast: { enabled: true, time: '08:40', endTime: '09:10' } } }, new Date('2026-09-23T00:00:00Z'))
  assert.equal((await service.getDay('account-1', member.id, '2026-09-22')).tracks[0].time, '08:10')
  assert.equal((await service.getDay('account-1', member.id, '2026-09-23')).tracks[0].time, '08:40')
})

test('confirmation creates one actual fact while skipped remains only an override', async () => {
  const { service, member, calls } = await fixture()
  await service.saveTemplateVersion('account-1', member.id, { effectiveFrom: '2026-09-22', items: { lunch: { enabled: true, time: '12:10', endTime: '12:40' } } }, new Date('2026-09-22T00:00:00Z'))
  await service.setOverride('account-1', member.id, '2026-09-22', 'lunch', { action: 'skipped' }, new Date('2026-09-22T12:30:00Z'))
  assert.equal(calls.length, 0)
  await service.setOverride('account-1', member.id, '2026-09-22', 'lunch', { action: 'reset' }, new Date('2026-09-22T12:31:00Z'))
  await service.setOverride('account-1', member.id, '2026-09-22', 'lunch', { action: 'confirm', occurredAt: '2026-09-22T12:10:00Z', startedAt: '2026-09-22T12:10:00Z', endedAt: '2026-09-22T12:40:00Z', idempotencyKey: 'routine-confirm-one' }, new Date('2026-09-22T12:40:00Z'))
  await service.setOverride('account-1', member.id, '2026-09-22', 'lunch', { action: 'confirm', occurredAt: '2026-09-22T12:10:00Z', startedAt: '2026-09-22T12:10:00Z', endedAt: '2026-09-22T12:40:00Z', idempotencyKey: 'routine-confirm-one' }, new Date('2026-09-22T12:41:00Z'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].journal.diet.meal, '午餐')
  assert.equal(calls[0].journal.diet.startedAt, '2026-09-22T12:10:00.000Z')
  assert.equal(calls[0].journal.diet.endedAt, '2026-09-22T12:40:00.000Z')
  assert.equal((await service.getDay('account-1', member.id, '2026-09-22')).tracks[0].status, 'confirmed')
})

test('deleted or moved confirmed records restore the routine track and another member cannot read it', async () => {
  const { service, member, members, recordMap } = await fixture()
  const sibling = await members.create({ accountId: 'account-1', name: '乐乐', relationship: 'child' })
  await service.saveTemplateVersion('account-1', member.id, { effectiveFrom: '2026-09-22', items: { dinner: { enabled: true, time: '18:10', endTime: '18:40' } } }, new Date('2026-09-22T00:00:00Z'))
  assert.equal((await service.getDay('account-1', sibling.id, '2026-09-22')).tracks.length, 0)
  await service.setOverride('account-1', member.id, '2026-09-22', 'dinner', { action: 'confirm', occurredAt: '2026-09-22T10:10:00Z', startedAt: '2026-09-22T10:10:00Z', endedAt: '2026-09-22T10:40:00Z', idempotencyKey: 'dinner-confirm' }, new Date('2026-09-22T12:00:00Z'))
  const confirmed = (await service.getDay('account-1', member.id, '2026-09-22')).tracks[0]
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.eventId, 'event-1')
  const saved = recordMap.get('record-1')
  saved.occurredAt = '2026-09-23T10:10:00.000Z'
  assert.equal((await service.getDay('account-1', member.id, '2026-09-22')).tracks[0].status, 'routine')
  saved.occurredAt = '2026-09-22T10:10:00.000Z'
  assert.equal((await service.getDay('account-1', member.id, '2026-09-22')).tracks[0].status, 'confirmed')
  recordMap.delete('record-1')
  assert.equal((await service.getDay('account-1', member.id, '2026-09-22')).tracks[0].status, 'routine')
})

test('cross-midnight sleep is one completed fact with the real duration', async () => {
  const { service, member, calls } = await fixture()
  await service.saveTemplateVersion('account-1', member.id, { effectiveFrom: '2026-09-22', items: { nightSleep: { enabled: true, time: '20:30', endTime: '07:10' } } }, new Date('2026-09-22T00:00:00Z'))
  await service.setOverride('account-1', member.id, '2026-09-22', 'nightSleep', { action: 'confirm', sleepAt: '2026-09-22T12:30:00.000Z', wakeAt: '2026-09-22T23:10:00.000Z', idempotencyKey: 'sleep-cross-midnight' }, new Date('2026-09-23T00:00:00Z'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].journal.sleep.durationMinutes, 640)
  assert.equal(calls[0].journal.sleep.status, 'completed')
})

test('custom routines keep a stable identity, create an activity fact and do not guess matches by title', async () => {
  const { service, member, calls, recordMap } = await fixture()
  const key = 'custom:outdoor_walk_20260922'
  const saved = await service.saveTemplateVersion('account-1', member.id, { effectiveFrom: '2026-09-22', items: { [key]: { enabled: true, title: '傍晚散步', time: '17:20', endTime: '17:50' } } }, new Date('2026-09-22T00:00:00Z'))
  assert.deepEqual(saved.items[0], { key, title: '傍晚散步', category: 'activity', time: '17:20', endTime: '17:50' })
  const track = (await service.getDay('account-1', member.id, '2026-09-22')).tracks[0]
  assert.equal(track.itemKey, key)
  assert.equal(track.status, 'routine')
  await service.setOverride('account-1', member.id, '2026-09-22', key, { action: 'confirm', occurredAt: '2026-09-22T09:20:00Z', startedAt: '2026-09-22T09:20:00Z', endedAt: '2026-09-22T09:50:00Z', idempotencyKey: 'custom-routine-confirm' }, new Date('2026-09-22T10:00:00Z'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].content, '傍晚散步')
  assert.deepEqual(calls[0].journal.categories, ['activity'])
  assert.equal((await service.getDay('account-1', member.id, '2026-09-22')).tracks[0].status, 'confirmed')
  recordMap.get('record-1').content = '调整后的散步记录'
  assert.equal((await service.getDay('account-1', member.id, '2026-09-22')).tracks[0].status, 'confirmed')
})

test('disabling the latest routine preserves earlier day templates and records', async () => {
  const { service, member } = await fixture()
  await service.saveTemplateVersion('account-1', member.id, { effectiveFrom: '2026-09-22', items: { breakfast: { enabled: true, time: '08:10', endTime: '08:40' } } }, new Date('2026-09-22T00:00:00Z'))
  await service.saveTemplateVersion('account-1', member.id, { effectiveFrom: '2026-09-23', enabled: false, items: {} }, new Date('2026-09-23T00:00:00Z'))
  assert.equal((await service.getDay('account-1', member.id, '2026-09-22')).tracks.length, 1)
  assert.equal((await service.getDay('account-1', member.id, '2026-09-23')).tracks.length, 0)
})
