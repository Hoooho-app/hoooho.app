import assert from 'node:assert/strict'
import test from 'node:test'
import { QuickRecordService } from './quick-record-service.mjs'

function setup({ failRecord = false, failRequest = false } = {}) {
  const eventRows = []
  const recordRows = []
  const requestRows = []
  let eventCreates = 0
  let recordCreates = 0
  const events = {
    repository: {
      findById: async (id) => eventRows.find((item) => item.id === id) ?? null
    },
    create: async (accountId, input) => {
      eventCreates += 1
      const event = { id: `event-${eventCreates}`, accountId, ...input }
      eventRows.push(event)
      return event
    },
    delete: async (_accountId, id) => {
      const index = eventRows.findIndex((item) => item.id === id)
      if (index >= 0) eventRows.splice(index, 1)
    }
  }
  const records = {
    repository: {
      findByAccountId: async (accountId) => recordRows.filter((item) => item.accountId === accountId),
      findById: async (id) => recordRows.find((item) => item.id === id) ?? null,
      update: async (id, changes) => Object.assign(recordRows.find((item) => item.id === id), changes),
      delete: async (id) => {
        const index = recordRows.findIndex((item) => item.id === id)
        if (index >= 0) recordRows.splice(index, 1)
      }
    },
    create: async (accountId, eventId, input) => {
      if (failRecord) throw new Error('record failed')
      recordCreates += 1
      const record = { id: `record-${recordCreates}`, accountId, eventId, ...input }
      recordRows.push(record)
      return record
    }
  }
  const requests = {
    find: async (accountId, idempotencyKey) => requestRows.find((item) => item.accountId === accountId && item.idempotencyKey === idempotencyKey) ?? null,
    save: async (input) => {
      if (failRequest) throw new Error('request failed')
      const previous = requestRows.find((item) => item.accountId === input.accountId && item.idempotencyKey === input.idempotencyKey)
      if (previous) Object.assign(previous, input)
      else requestRows.push({ ...input })
      return input
    }
  }
  return { service: new QuickRecordService({ events, records, requests }), eventRows, recordRows, counts: () => ({ eventCreates, recordCreates }) }
}

const input = {
  memberId: 'member-1',
  content: '今晚体温 38.5 度',
  occurredAt: '2026-09-02T10:00:00.000Z',
  inputChannel: 'voice',
  idempotencyKey: 'session_12345678',
  title: '体温 38.5 度'
}

test('quick record creates the event and record only after confirmation', async () => {
  const state = setup()
  assert.deepEqual(state.counts(), { eventCreates: 0, recordCreates: 0 })
  const created = await state.service.create('account-1', input, new Date('2026-09-02T11:00:00.000Z'))
  assert.equal(created.idempotent, false)
  assert.deepEqual(state.counts(), { eventCreates: 1, recordCreates: 1 })
  assert.equal(state.recordRows[0].sourceType, 'voice_record')
  assert.equal(state.recordRows[0].note, null)
})

test('quick record reuses the persisted result for the same idempotency key', async () => {
  const state = setup()
  const first = await state.service.create('account-1', input)
  const second = await state.service.create('account-1', input)
  assert.equal(second.eventId, first.eventId)
  assert.equal(second.recordId, first.recordId)
  assert.equal(second.idempotent, true)
  assert.deepEqual(state.counts(), { eventCreates: 1, recordCreates: 1 })
})

test('quick record collapses concurrent submissions with the same key', async () => {
  const state = setup()
  const [left, right] = await Promise.all([
    state.service.create('account-1', input),
    state.service.create('account-1', input)
  ])
  assert.deepEqual(left, right)
  assert.deepEqual(state.counts(), { eventCreates: 1, recordCreates: 1 })
})

test('quick record rolls back both event and record when confirmation persistence fails', async () => {
  const state = setup({ failRequest: true })
  await assert.rejects(() => state.service.create('account-1', input), /request failed/)
  assert.equal(state.eventRows.length, 0)
  assert.equal(state.recordRows.length, 0)
})
