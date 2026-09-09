import assert from 'node:assert/strict'
import test from 'node:test'
import { QuickRecordService } from './quick-record-service.mjs'

function setup({ failRecord = false, failRequest = false, failPhotos = false } = {}) {
  const eventRows = []
  const recordRows = []
  const requestRows = []
  let eventCreates = 0
  let recordCreates = 0
  const events = {
    repository: {
      findByAccountId: async (accountId) => eventRows.filter((item) => item.accountId === accountId),
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
  const photoCalls = []
  const photos = {
    prepareForSave: async (_accountId, _memberId, _draftId, photoIds) => photoIds.map((id, sortOrder) => ({ id, sortOrder })),
    attach: async (_accountId, eventId, recordId, memberId, drafts) => {
      if (failPhotos) throw new Error('photo attach failed')
      photoCalls.push({ eventId, recordId, memberId, drafts })
      return drafts.map((draft) => ({ id: `attachment-${draft.id}` }))
    },
    consume: async () => undefined,
    rollback: async () => undefined
  }
  return { service: new QuickRecordService({ events, records, requests, photos }), eventRows, recordRows, photoCalls, counts: () => ({ eventCreates, recordCreates }) }
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

test('optional journal categories preserve verbatim content and existing idempotency', async () => {
  const state = setup()
  const journalInput = { ...input, journal: { categories: ['diet', 'social', 'diet'] } }
  const result = await state.service.create('account-1', journalInput)
  const retried = await state.service.create('account-1', journalInput)
  assert.equal(retried.recordId, result.recordId)
  assert.deepEqual(state.recordRows[0].journal, { categories: ['diet', 'social'] })
  assert.equal(state.recordRows[0].content, input.content)
  assert.equal(state.recordRows[0].occurredAt, input.occurredAt)
  await assert.rejects(() => setup().service.create('account-1', { ...input, journal: { categories: ['invented'] } }), /记录分类无效/)
})

test('quick record persists multiple medications and independent reminder settings', async () => {
  const state = setup()
  const medications = [
    { id: 'drug-one', medicationName: '布洛芬混悬液', amountValue: 2.5, amountUnit: 'mL', dosageStep: 0.5, reminder: { enabled: true, frequency: 'daily', timesPerDay: 3, times: ['08:00', '14:00', '20:00'], durationDays: 5 } },
    { id: 'drug-two', medicationName: '对乙酰氨基酚', amountValue: 1, amountUnit: '片', dosageStep: 1, reminder: { enabled: false, frequency: 'daily', timesPerDay: 1, times: ['08:00'], durationDays: 1 } }
  ]
  await state.service.create('account-1', { ...input, content: '布洛芬混悬液 · 2.5 mL\n对乙酰氨基酚 · 1 片', journal: { categories: ['medication'], medication: { medications, medicationName: medications[0].medicationName, administrationRoute: 'oral', amountValue: 2.5, amountUnit: 'mL' } } })
  assert.equal(state.recordRows[0].journal.medication.medications.length, 2)
  assert.equal(state.recordRows[0].journal.medication.medications.filter((item) => item.reminder?.enabled).length, 1)
  await assert.rejects(() => setup().service.create('account-1', { ...input, journal: { categories: ['medication'], medication: { medications: [{ ...medications[0], dosageStep: 0.3 }], medicationName: 'x', administrationRoute: 'oral' } } }), /剂量步长无效/)
})

test('quick record persists structured diet details without changing member ownership', async () => {
  const state = setup()
  const journal = { categories: ['diet'], diet: { kind: 'meal', meal: '午餐', foods: ['番茄牛肉', '米饭'], amount: '一半', appetite: '和平时差不多', reactions: ['暂未发现'] } }
  await state.service.create('account-1', { ...input, memberId: 'child-one', content: '正餐 · 午餐\n番茄牛肉、米饭 · 一半', journal })
  assert.equal(state.eventRows[0].memberId, 'child-one')
  assert.deepEqual(state.recordRows[0].journal, journal)
  assert.equal(state.recordRows[0].content, '正餐 · 午餐\n番茄牛肉、米饭 · 一半')
})

test('quick record persists structured sleep for only the selected member and sorts at wake time', async () => {
  const state = setup()
  const journal = { categories: ['sleep'], sleep: { sleepAt: '2026-09-01T13:40:00.000Z', wakeAt: '2026-09-01T22:35:00.000Z', durationMinutes: 535, kind: 'night', quality: '睡得安稳', observations: ['夜醒'] } }
  await state.service.create('account-1', { ...input, idempotencyKey: 'sleep_12345678', memberId: 'child-sleep', occurredAt: '2026-09-02T10:00:00.000Z', content: '夜间睡眠\n21:40–06:35 · 8小时55分钟', journal })
  assert.equal(state.eventRows[0].memberId, 'child-sleep')
  assert.equal(state.recordRows[0].occurredAt, journal.sleep.wakeAt)
  assert.deepEqual(state.recordRows[0].journal, journal)
})

test('quick record persists outdoor activity facts and rejects conflicting none-observed values', async () => {
  const state = setup()
  const journal = { categories: ['activity'], outdoorActivity: { activities: ['stroller_outing', 'walking'], durationMinutes: 45, places: ['park'], contacts: ['cold_air'], activityState: 'good', observations: ['cough'] } }
  await state.service.create('account-1', { ...input, idempotencyKey: 'outdoor_12345678', memberId: 'child-outdoor', content: '户外活动\n公园 · 推车外出、散步 · 45分钟', journal })
  assert.equal(state.eventRows[0].memberId, 'child-outdoor')
  assert.deepEqual(state.recordRows[0].journal, journal)
  await assert.rejects(() => setup().service.create('account-1', { ...input, idempotencyKey: 'outdoor_invalid_1', journal: { categories: ['activity'], outdoorActivity: { activities: [], places: [], contacts: ['none_observed', 'dust'], observations: [] } } }), /环境接触选项互斥/)
  await assert.rejects(() => setup().service.create('account-1', { ...input, idempotencyKey: 'outdoor_invalid_2', journal: { categories: ['activity'], outdoorActivity: { activities: [], places: [], contacts: [], observations: ['none_observed', 'cough'] } } }), /身体观察选项互斥/)
  await assert.rejects(() => setup().service.create('account-1', { ...input, idempotencyKey: 'outdoor_invalid_3', journal: { categories: ['activity'], outdoorActivity: { activities: [], durationRange: '30_60', durationMinutes: 45, places: [], contacts: [], observations: [] } } }), /活动时长只能选择一种填写方式/)
})

test('visit is persisted as a visit and rejects links owned by another member', async () => {
  const state = setup()
  state.eventRows.push({ id: 'symptom-event', accountId: 'account-1', memberId: 'child-other' })
  state.recordRows.push({ id: 'symptom-record', accountId: 'account-1', eventId: 'symptom-event', journal: { categories: ['symptom'] } })
  const journal = { categories: ['visit'], visit: { visitType: 'outpatient', institutionName: '儿童医院' } }
  await state.service.create('account-1', { ...input, idempotencyKey: 'visit_12345678', memberId: 'child-one', content: '门诊 · 儿童医院', journal })
  assert.equal(state.recordRows.at(-1).type, 'visit')
  await assert.rejects(() => state.service.create('account-1', { ...input, idempotencyKey: 'visit_87654321', memberId: 'child-one', content: '门诊', journal: { categories: ['visit'], visit: { visitType: 'outpatient', linkedSymptomRecordIds: ['symptom-record'] } } }), /不属于当前人物/)
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

test('quick record atomically associates uploaded photos with the created event and record', async () => {
  const state = setup()
  const created = await state.service.create('account-1', { ...input, photoDraftId: 'draft_12345678', photoIds: ['photo-1', 'photo-2'] })
  assert.equal(created.photoCount, 2)
  assert.deepEqual(state.photoCalls[0], {
    eventId: created.eventId,
    recordId: created.recordId,
    memberId: input.memberId,
    drafts: [{ id: 'photo-1', sortOrder: 0 }, { id: 'photo-2', sortOrder: 1 }]
  })
})

test('quick record photo association failure rolls back text event and record', async () => {
  const state = setup({ failPhotos: true })
  await assert.rejects(() => state.service.create('account-1', { ...input, photoDraftId: 'draft_12345678', photoIds: ['photo-1'] }), /photo attach failed/)
  assert.equal(state.eventRows.length, 0)
  assert.equal(state.recordRows.length, 0)
})

test('verbatim smart-recognition retries with a new key are still confirmed as possible duplicates', async () => {
  const state = setup()
  await state.service.create('account-1', input)
  const repeated = { ...input, idempotencyKey: 'session_13345678', occurredAt: '2026-09-02T10:01:00.000Z' }
  assert.equal((await state.service.checkDuplicate('account-1', repeated)).duplicate?.eventId, 'event-1')
  await assert.rejects(() => state.service.create('account-1', repeated), (error) => error.code === 'POSSIBLE_DUPLICATE_RECORD')
})

const forehead = { id: 'head-forehead-1', label: '前额1号区域', locationNumber: 1, locationLayer: 'surface', bodySide: 'center', bodyView: 'front', bodyRegion: 'head', localRegion: 'forehead' }
const crown = { ...forehead, id: 'head-crown-1', label: '头顶部1号区域', localRegion: 'crown' }
const symptomInput = (changes = {}) => ({
  ...input,
  content: '孩子头顶部1号区域发热，表现为身体发热。',
  title: '身体发热',
  journal: { categories: ['symptom'], symptom: { symptomCategory: 'fever', locations: [crown], descriptors: ['身体发热'], trend: 'same' } },
  ...changes
})

test('similar symptoms on adjacent head regions require an explicit user choice', async () => {
  const state = setup()
  await state.service.create('account-1', symptomInput(), new Date('2026-09-02T10:00:00.000Z'))
  const repeated = symptomInput({ idempotencyKey: 'session_22345678', content: '孩子前额1号区域发热，表现为身体发热。', occurredAt: '2026-09-02T10:01:00.000Z', journal: { categories: ['symptom'], symptom: { symptomCategory: 'fever', locations: [forehead], descriptors: ['身体发热'], trend: 'same' } } })
  const checked = await state.service.checkDuplicate('account-1', repeated, new Date('2026-09-02T10:01:00.000Z'))
  assert.equal(checked.duplicate?.eventId, 'event-1')
  await assert.rejects(() => state.service.create('account-1', repeated, new Date('2026-09-02T10:01:00.000Z')), (error) => error.code === 'POSSIBLE_DUPLICATE_RECORD')
  assert.deepEqual(state.counts(), { eventCreates: 1, recordCreates: 1 })
})

test('situation update appends a record node without overwriting the original event', async () => {
  const state = setup()
  await state.service.create('account-1', symptomInput(), new Date('2026-09-02T10:00:00.000Z'))
  const repeated = symptomInput({ idempotencyKey: 'session_32345678', content: '孩子前额1号区域发热，体温升到38.5度。', occurredAt: '2026-09-02T10:02:00.000Z', journal: { categories: ['symptom'], symptom: { symptomCategory: 'fever', locations: [forehead], descriptors: ['身体发热'], impactLevel: 'clear', trend: 'more_noticeable' } } })
  const created = await state.service.create('account-1', { ...repeated, rawText: repeated.content, content: '体温升到38.5度', duplicateAction: 'update', duplicateEventId: 'event-1' }, new Date('2026-09-02T10:02:00.000Z'))
  assert.equal(created.eventId, 'event-1')
  assert.deepEqual(state.counts(), { eventCreates: 1, recordCreates: 2 })
  assert.equal(state.recordRows[0].content, symptomInput().content)
  assert.equal(state.recordRows[1].content, '体温升到38.5度')
  assert.equal(state.recordRows[1].sourceText, repeated.content)
  assert.equal(state.recordRows[1].note, 'event-update:record-1')
})

test('force-create preserves an independent event while member isolation avoids false matches', async () => {
  const state = setup()
  await state.service.create('account-1', symptomInput(), new Date('2026-09-02T10:00:00.000Z'))
  const repeated = symptomInput({ idempotencyKey: 'session_42345678', occurredAt: '2026-09-02T10:03:00.000Z' })
  await state.service.create('account-1', { ...repeated, duplicateAction: 'create', duplicateEventId: 'event-1' }, new Date('2026-09-02T10:03:00.000Z'))
  assert.deepEqual(state.counts(), { eventCreates: 2, recordCreates: 2 })
  const otherMember = await state.service.checkDuplicate('account-1', symptomInput({ idempotencyKey: 'session_52345678', memberId: 'member-2', occurredAt: '2026-09-02T10:04:00.000Z' }))
  assert.equal(otherMember.duplicate, null)
})
