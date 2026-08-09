import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { authApiPlugin } from '../auth/vite-auth-plugin.mjs'
import { membersApiPlugin } from './vite-members-plugin.mjs'

const postJson = (url, body, token) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body)
})

const requestJson = (url, method, token, body) => fetch(url, {
  method,
  headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
  ...(body ? { body: JSON.stringify(body) } : {})
})

async function login(baseUrl, phone) {
  await postJson(`${baseUrl}/api/auth/send-code`, { phone })
  const response = await postJson(`${baseUrl}/api/auth/login`, { phone, code: '123456' })
  assert.equal(response.status, 200)
  return response.json()
}

test('FamilyMember API 支持本人初始化、CRUD 和账号隔离', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-members-api-'))
  const sharedOptions = { dataDirectory, tokenSecret: 'members-test-secret' }
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 5193, strictPort: false },
    plugins: [
      authApiPlugin({ ...sharedOptions, codeGenerator: () => '123456', logger: () => undefined }),
      membersApiPlugin(sharedOptions)
    ]
  })

  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const first = await login(baseUrl, '13612345678')
    const second = await login(baseUrl, '13512345678')

    const unauthorized = await fetch(`${baseUrl}/api/members`)
    assert.equal(unauthorized.status, 401)

    const initialList = await requestJson(`${baseUrl}/api/members`, 'GET', first.token)
    assert.equal(initialList.status, 200)
    const initialMembers = await initialList.json()
    assert.equal(initialMembers.length, 1)
    assert.equal(initialMembers[0].relationship, 'self')
    assert.equal(initialMembers[0].isSelf, true)

    const createdResponse = await postJson(`${baseUrl}/api/members`, {
      name: '小明', relationship: 'child', gender: 'male', birthday: '2018-06-02'
    }, first.token)
    assert.equal(createdResponse.status, 201)
    const child = await createdResponse.json()
    assert.equal(child.accountId, first.user.id)
    assert.equal(child.isSelf, false)

    const listResponse = await requestJson(`${baseUrl}/api/members`, 'GET', first.token)
    const list = await listResponse.json()
    assert.equal(list.length, 2)

    const updatedResponse = await requestJson(`${baseUrl}/api/members/${child.id}`, 'PATCH', first.token, { name: '小明同学' })
    assert.equal(updatedResponse.status, 200)
    assert.equal((await updatedResponse.json()).name, '小明同学')

    const crossAccountResponse = await requestJson(`${baseUrl}/api/members/${child.id}`, 'GET', second.token)
    assert.equal(crossAccountResponse.status, 404)

    const deleteResponse = await requestJson(`${baseUrl}/api/members/${child.id}`, 'DELETE', first.token)
    assert.equal(deleteResponse.status, 200)
    assert.deepEqual(await deleteResponse.json(), { success: true })

    const finalResponse = await requestJson(`${baseUrl}/api/members`, 'GET', first.token)
    const finalMembers = await finalResponse.json()
    assert.equal(finalMembers.length, 1)
    assert.equal(finalMembers[0].isSelf, true)

    const deleteSelfResponse = await requestJson(`${baseUrl}/api/members/${finalMembers[0].id}`, 'DELETE', first.token)
    assert.equal(deleteSelfResponse.status, 400)
  } finally {
    await server.close()
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
