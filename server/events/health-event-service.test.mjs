import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { authApiPlugin } from '../auth/vite-auth-plugin.mjs'
import { membersApiPlugin } from '../members/vite-members-plugin.mjs'
import { eventsApiPlugin } from './vite-events-plugin.mjs'
import { HealthEventService, validateStartTime } from './health-event-service.mjs'

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
  const session = await response.json()
  const selfResponse = await jsonRequest(`${baseUrl}/api/members/self`, 'POST', session.token, {})
  assert.equal(selfResponse.status, 201)
  return session
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

test('北京时间跨日窗口创建事件仍保存标准 UTC 时间点', async () => {
  const now = new Date('2026-08-27T16:00:00.000Z')
  const service = new HealthEventService({
    members: { findById: async () => ({ id: 'member-1', accountId: 'account-1', relationship: 'child', birthday: '2022-01-01' }) },
    repository: {
      create: async (input, createdAt) => ({ ...input, createdAt: createdAt.toISOString(), updatedAt: createdAt.toISOString() })
    }
  })
  const created = await service.create('account-1', {
    memberId: 'member-1', title: '', category: 'other'
  }, now)

  assert.equal(created.startTime, '2026-08-27T16:00:00.000Z')
  assert.equal(created.createdAt, '2026-08-27T16:00:00.000Z')
  assert.equal(created.recoveredAt, null)
})

test('事件只在进入康复状态时写入语义明确的结束时间，重新观察时清空', async () => {
  let stored = {
    id: 'event-1', accountId: 'account-1', memberId: 'member-1', title: '发热', category: 'fever',
    status: 'observing', startTime: '2026-08-29T01:00:00.000Z', recoveredAt: null,
    createdAt: '2026-08-29T01:00:00.000Z', updatedAt: '2026-08-29T01:00:00.000Z'
  }
  const service = new HealthEventService({
    members: { findById: async () => ({ id: 'member-1', accountId: 'account-1', relationship: 'child', birthday: '2022-01-01' }) },
    repository: {
      findById: async () => stored,
      update: async (_id, changes, now) => (stored = { ...stored, ...changes, updatedAt: now.toISOString() })
    }
  })
  const recoveredAt = new Date('2026-08-30T02:00:00.000Z')
  const recovered = await service.update('account-1', stored.id, { status: 'recovered' }, recoveredAt)
  assert.equal(recovered.recoveredAt, recoveredAt.toISOString())

  const reopened = await service.update('account-1', stored.id, { status: 'observing' }, new Date('2026-08-31T00:00:00.000Z'))
  assert.equal(reopened.recoveredAt, null)
})

test('HealthEvent API 仅允许孩子新增、支持当前孩子作用域并隔离不同账号', async () => {
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
    assert.equal(emptyEventResponse.status, 409)
    assert.equal((await emptyEventResponse.json()).error.code, 'CHILD_ONLY')

    const selfEventResponse = await jsonRequest(`${baseUrl}/api/events`, 'POST', first.token, {
      memberId: selfMember.id,
      title: '',
      category: 'other',
      startTime: '2026-08-08T20:00:00+08:00',
      status: 'recovered'
    })
    assert.equal(selfEventResponse.status, 409)
    assert.equal((await selfEventResponse.json()).error.code, 'CHILD_ONLY')

    const childResponse = await jsonRequest(`${baseUrl}/api/members`, 'POST', first.token, {
      name: '小明', relationship: 'child', gender: 'male', birthday: '2021-06-02'
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

    const siblingResponse = await jsonRequest(`${baseUrl}/api/members`, 'POST', first.token, {
      name: '小雨', relationship: 'child', gender: 'female', birthday: '2022-04-18'
    })
    const sibling = await siblingResponse.json()
    const scopedDetail = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}?memberId=${encodeURIComponent(sibling.id)}`, 'GET', first.token)
    assert.equal(scopedDetail.status, 404)

    const scopedList = await jsonRequest(`${baseUrl}/api/events?memberId=${encodeURIComponent(sibling.id)}`, 'GET', first.token)
    assert.equal(scopedList.status, 200)
    assert.deepEqual(await scopedList.json(), [])

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
    assert.equal(updated.recoveredAt, null)

    const recoveredResponse = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}`, 'PATCH', first.token, {
      status: 'recovered'
    })
    assert.equal(recoveredResponse.status, 200)
    const recovered = await recoveredResponse.json()
    assert.equal(recovered.status, 'recovered')
    assert.ok(recovered.recoveredAt)

    const futureUpdateResponse = await jsonRequest(`${baseUrl}/api/events/${childEvent.id}`, 'PATCH', first.token, {
      startTime: '2037-01-01T00:00:00+08:00'
    })
    assert.equal(futureUpdateResponse.status, 400)
    assert.equal((await futureUpdateResponse.json()).error.code, 'FUTURE_START_TIME')

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
    assert.equal(remaining.length, 0)
  } finally {
    await server.close()
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
