import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { authApiPlugin } from '../auth/vite-auth-plugin.mjs'
import { membersApiPlugin } from '../members/vite-members-plugin.mjs'
import { eventsApiPlugin } from './vite-events-plugin.mjs'
import { validateStartTime } from './health-event-service.mjs'

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

async function listMembers(baseUrl, token) {
  const response = await jsonRequest(`${baseUrl}/api/members`, 'GET', token)
  assert.equal(response.status, 200)
  return response.json()
}

test('健康事件开始时间不能晚于服务端当前时刻', () => {
  const serverNow = new Date('2026-08-12T07:35:00.000Z')
  assert.equal(validateStartTime('2005-03-01T00:00:00+08:00', serverNow), '2005-02-28T16:00:00.000Z')
  assert.equal(validateStartTime('2026-08-12T15:35:00+08:00', serverNow), serverNow.toISOString())
  assert.throws(
    () => validateStartTime('2026-08-12T18:00:00+08:00', serverNow),
    (error) => error.code === 'FUTURE_START_TIME' && error.message === '发生时间不能晚于现在'
  )
})

test('HealthEvent API 支持本人和孩子事件 CRUD，并隔离不同账号', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-events-api-'))
  const sharedOptions = { dataDirectory, tokenSecret: 'events-test-secret' }
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 5194, strictPort: false },
    plugins: [
      authApiPlugin({ ...sharedOptions, codeGenerator: () => '123456', logger: () => undefined }),
      membersApiPlugin(sharedOptions),
      eventsApiPlugin(sharedOptions)
    ]
  })

  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const first = await login(baseUrl, '13412345678')
    const second = await login(baseUrl, '13312345678')
    const [selfMember] = await listMembers(baseUrl, first.token)
    const [secondSelfMember] = await listMembers(baseUrl, second.token)

    const unauthorized = await jsonRequest(`${baseUrl}/api/events`, 'GET', null)
    assert.equal(unauthorized.status, 401)

    const futureEventResponse = await jsonRequest(`${baseUrl}/api/events`, 'POST', first.token, {
      memberId: selfMember.id,
      title: '未来事件',
      category: 'other',
      startTime: '2037-01-01T00:00:00+08:00'
    })
    assert.equal(futureEventResponse.status, 400)
    assert.deepEqual((await futureEventResponse.json()).error, {
      code: 'FUTURE_START_TIME',
      message: '发生时间不能晚于现在'
    })

    const emptyEventResponse = await jsonRequest(`${baseUrl}/api/events`, 'POST', first.token, {
      memberId: selfMember.id,
      title: '',
      category: 'other'
    })
    assert.equal(emptyEventResponse.status, 201)
    const emptyEvent = await emptyEventResponse.json()
    assert.equal(emptyEvent.startTime, emptyEvent.createdAt)

    const selfEventResponse = await jsonRequest(`${baseUrl}/api/events`, 'POST', first.token, {
      memberId: selfMember.id,
      title: '',
      category: 'other',
      startTime: '2026-08-08T20:00:00+08:00',
      status: 'recovered'
    })
    assert.equal(selfEventResponse.status, 201)
    const selfEvent = await selfEventResponse.json()
    assert.equal(selfEvent.accountId, first.user.id)
    assert.equal(selfEvent.memberId, selfMember.id)
    assert.equal(selfEvent.status, 'observing')
    assert.equal(selfEvent.title, '')

    const childResponse = await jsonRequest(`${baseUrl}/api/members`, 'POST', first.token, {
      name: '小明', relationship: 'child', gender: 'male', birthday: '2018-06-02'
    })
    assert.equal(childResponse.status, 201)
    const child = await childResponse.json()

    const childEventResponse = await jsonRequest(`${baseUrl}/api/events`, 'POST', first.token, {
      memberId: child.id,
      title: '发烧',
      category: 'fever',
      startTime: '2026-08-09T09:00:00+08:00'
    })
    assert.equal(childEventResponse.status, 201)
    const childEvent = await childEventResponse.json()

    const detailResponse = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}`, 'GET', first.token)
    assert.equal(detailResponse.status, 200)
    assert.equal((await detailResponse.json()).id, childEvent.id)

    const listResponse = await jsonRequest(`${baseUrl}/api/events`, 'GET', first.token)
    assert.equal(listResponse.status, 200)
    const events = await listResponse.json()
    assert.equal(events.length, 1)
    assert.equal(events[0].id, childEvent.id)

    const updateResponse = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}`, 'PATCH', first.token, {
      title: '发热', status: 'handling'
    })
    assert.equal(updateResponse.status, 200)
    const updated = await updateResponse.json()
    assert.equal(updated.title, '发热')
    assert.equal(updated.status, 'handling')

    const futureUpdateResponse = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}`, 'PATCH', first.token, {
      startTime: '2037-01-01T00:00:00+08:00'
    })
    assert.equal(futureUpdateResponse.status, 400)
    assert.equal((await futureUpdateResponse.json()).error.code, 'FUTURE_START_TIME')

    const namedEmptyEventResponse = await jsonRequest(`${baseUrl}/api/events/${selfEvent.id}`, 'PATCH', first.token, {
      title: '咳嗽'
    })
    assert.equal(namedEmptyEventResponse.status, 200)
    assert.equal((await namedEmptyEventResponse.json()).title, '咳嗽')

    const afterNamingResponse = await jsonRequest(`${baseUrl}/api/events`, 'GET', first.token)
    const afterNaming = await afterNamingResponse.json()
    assert.deepEqual(new Set(afterNaming.map((event) => event.id)), new Set([selfEvent.id, childEvent.id]))

    const crossMemberCreate = await jsonRequest(`${baseUrl}/api/events`, 'POST', first.token, {
      memberId: secondSelfMember.id,
      title: '腹痛',
      category: 'pain',
      startTime: '2026-08-09T10:00:00+08:00'
    })
    assert.equal(crossMemberCreate.status, 404)

    const crossRead = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}`, 'GET', second.token)
    const crossUpdate = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}`, 'PATCH', second.token, { status: 'recovered' })
    const crossDelete = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}`, 'DELETE', second.token)
    assert.equal(crossRead.status, 404)
    assert.equal(crossUpdate.status, 404)
    assert.equal(crossDelete.status, 404)

    const deleteResponse = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}`, 'DELETE', first.token)
    assert.equal(deleteResponse.status, 200)
    assert.deepEqual(await deleteResponse.json(), { success: true })

    const afterDelete = await jsonRequest(`${baseUrl}/api/events`, 'GET', first.token)
    const remaining = await afterDelete.json()
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].id, selfEvent.id)
  } finally {
    await server.close()
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
