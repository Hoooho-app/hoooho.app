import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { authApiPlugin } from '../auth/vite-auth-plugin.mjs'
import { membersApiPlugin } from '../members/vite-members-plugin.mjs'
import { eventsApiPlugin } from './vite-events-plugin.mjs'
import { eventRecordsApiPlugin } from './vite-event-records-plugin.mjs'

const jsonRequest = (url, method, token, body) => fetch(url, {
  method,
  headers: {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  },
  ...(body ? { body: JSON.stringify(body) } : {})
})

async function login(baseUrl, phone) {
  await jsonRequest(`${baseUrl}/api/auth/send-code`, 'POST', null, { phone })
  const response = await jsonRequest(`${baseUrl}/api/auth/login`, 'POST', null, { phone, code: '123456' })
  assert.equal(response.status, 200)
  return response.json()
}

async function createEvent(baseUrl, token, memberId, title = '发烧') {
  const response = await jsonRequest(`${baseUrl}/api/events`, 'POST', token, {
    memberId,
    title,
    category: title === '发烧' ? 'fever' : 'other',
    startTime: '2026-08-09T09:00:00+08:00'
  })
  assert.equal(response.status, 201)
  return response.json()
}

test('HealthEventRecord API 支持事实记录 CRUD、稳定排序和账号隔离', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-event-records-api-'))
  const sharedOptions = { dataDirectory, tokenSecret: 'event-records-test-secret' }
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 5195, strictPort: false },
    plugins: [
      authApiPlugin({ ...sharedOptions, codeGenerator: () => '123456', logger: () => undefined }),
      membersApiPlugin(sharedOptions),
      eventsApiPlugin(sharedOptions),
      eventRecordsApiPlugin(sharedOptions)
    ]
  })

  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const first = await login(baseUrl, '13212345678')
    const second = await login(baseUrl, '13112345678')

    const firstMembersResponse = await jsonRequest(`${baseUrl}/api/members`, 'GET', first.token)
    const secondMembersResponse = await jsonRequest(`${baseUrl}/api/members`, 'GET', second.token)
    assert.equal(firstMembersResponse.status, 200)
    assert.equal(secondMembersResponse.status, 200)
    const [firstMember] = await firstMembersResponse.json()
    const [secondMember] = await secondMembersResponse.json()
    const event = await createEvent(baseUrl, first.token, firstMember.id)
    const secondEvent = await createEvent(baseUrl, second.token, secondMember.id, '其他情况')

    const unauthorized = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'GET', null)
    assert.equal(unauthorized.status, 401)

    const eveningResponse = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'POST', first.token, {
      type: 'note',
      content: '精神状态好转',
      occurredAt: '2026-08-09T18:00:00+08:00'
    })
    const morningResponse = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'POST', first.token, {
      type: 'symptom',
      content: '体温 38.5℃',
      occurredAt: '2026-08-09T09:00:00+08:00'
    })
    const noonResponse = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'POST', first.token, {
      type: 'medication',
      content: '服用一次退烧药',
      occurredAt: '2026-08-09T12:00:00+08:00'
    })
    assert.equal(eveningResponse.status, 201)
    assert.equal(morningResponse.status, 201)
    assert.equal(noonResponse.status, 201)
    const evening = await eveningResponse.json()
    const morning = await morningResponse.json()
    const noon = await noonResponse.json()
    assert.equal(morning.accountId, first.user.id)
    assert.equal(morning.eventId, event.id)
    assert.equal(morning.content, '体温 38.5℃')

    const invalidTypeResponse = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'POST', first.token, {
      type: 'diagnosis',
      content: '不应被接受的记录类型',
      occurredAt: '2026-08-09T13:00:00+08:00'
    })
    assert.equal(invalidTypeResponse.status, 400)
    assert.equal((await invalidTypeResponse.json()).error.code, 'INVALID_RECORD_TYPE')

    const listResponse = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'GET', first.token)
    assert.equal(listResponse.status, 200)
    const records = await listResponse.json()
    assert.deepEqual(records.map((record) => record.id), [morning.id, noon.id, evening.id])

    const sameTimeFirstResponse = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'POST', first.token, {
      type: 'note', content: '同一时间第一条', occurredAt: '2026-08-09T19:00:00+08:00'
    })
    const sameTimeSecondResponse = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'POST', first.token, {
      type: 'note', content: '同一时间第二条', occurredAt: '2026-08-09T19:00:00+08:00'
    })
    const sameTimeFirst = await sameTimeFirstResponse.json()
    const sameTimeSecond = await sameTimeSecondResponse.json()
    const sameTimeList = await (await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'GET', first.token)).json()
    const sameTimeRecords = sameTimeList.filter((record) => record.occurredAt === sameTimeFirst.occurredAt)
    const expectedSameTimeOrder = [sameTimeFirst, sameTimeSecond]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map((record) => record.id)
    assert.deepEqual(sameTimeRecords.map((record) => record.id), expectedSameTimeOrder)

    const updateResponse = await jsonRequest(`${baseUrl}/api/records/${noon.id}`, 'PATCH', first.token, {
      type: 'medication',
      content: '12:00 服用一次退烧药',
      occurredAt: '2026-08-09T12:05:00+08:00'
    })
    assert.equal(updateResponse.status, 200)
    const updated = await updateResponse.json()
    assert.equal(updated.content, '12:00 服用一次退烧药')
    assert.equal(updated.occurredAt, '2026-08-09T04:05:00.000Z')

    const immutableResponse = await jsonRequest(`${baseUrl}/api/records/${noon.id}`, 'PATCH', first.token, {
      accountId: second.user.id,
      content: '不应被接受'
    })
    assert.equal(immutableResponse.status, 400)
    assert.equal((await immutableResponse.json()).error.code, 'IMMUTABLE_RECORD_FIELD')

    const crossCreate = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'POST', second.token, {
      type: 'note', content: '越权记录', occurredAt: '2026-08-09T20:00:00+08:00'
    })
    const crossList = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'GET', second.token)
    const crossUpdate = await jsonRequest(`${baseUrl}/api/records/${morning.id}`, 'PATCH', second.token, { content: '越权修改' })
    const crossDelete = await jsonRequest(`${baseUrl}/api/records/${morning.id}`, 'DELETE', second.token)
    assert.equal(crossCreate.status, 404)
    assert.equal(crossList.status, 404)
    assert.equal(crossUpdate.status, 404)
    assert.equal(crossDelete.status, 404)

    const recoveredResponse = await jsonRequest(`${baseUrl}/api/events/${event.id}`, 'PATCH', first.token, { status: 'recovered' })
    assert.equal(recoveredResponse.status, 200)
    const recoveredRecordResponse = await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'POST', first.token, {
      type: 'visit',
      content: '康复后补记医生沟通内容',
      occurredAt: '2026-08-10T10:00:00+08:00'
    })
    assert.equal(recoveredRecordResponse.status, 201)

    const secondOwnRecordResponse = await jsonRequest(`${baseUrl}/api/events/${secondEvent.id}/records`, 'POST', second.token, {
      type: 'other', content: '第二个账号的记录', occurredAt: '2026-08-09T10:00:00+08:00'
    })
    assert.equal(secondOwnRecordResponse.status, 201)

    const deleteResponse = await jsonRequest(`${baseUrl}/api/records/${evening.id}`, 'DELETE', first.token)
    assert.equal(deleteResponse.status, 200)
    assert.deepEqual(await deleteResponse.json(), { success: true })
    const afterDelete = await (await jsonRequest(`${baseUrl}/api/events/${event.id}/records`, 'GET', first.token)).json()
    assert.equal(afterDelete.some((record) => record.id === evening.id), false)
  } finally {
    await server.close()
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
