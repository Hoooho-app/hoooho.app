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

    const yearOnlyResponse = await requestJson(`${baseUrl}/api/members/${initialMembers[0].id}`, 'PATCH', first.token, {
      birthday: '1990'
    })
    assert.equal(yearOnlyResponse.status, 200)
    assert.equal((await yearOnlyResponse.json()).birthday, '1990')

    const futureYearResponse = await requestJson(`${baseUrl}/api/members/${initialMembers[0].id}`, 'PATCH', first.token, {
      birthday: String(new Date().getUTCFullYear() + 1)
    })
    assert.equal(futureYearResponse.status, 400)
    assert.equal((await futureYearResponse.json()).error.code, 'INVALID_BIRTHDAY')

    const incompleteDateResponse = await requestJson(`${baseUrl}/api/members/${initialMembers[0].id}`, 'PATCH', first.token, {
      birthday: '1990-01'
    })
    assert.equal(incompleteDateResponse.status, 400)
    assert.equal((await incompleteDateResponse.json()).error.code, 'INVALID_BIRTHDAY')

    const listResponse = await requestJson(`${baseUrl}/api/members`, 'GET', first.token)
    const list = await listResponse.json()
    assert.equal(list.length, 2)

    const updatedResponse = await requestJson(`${baseUrl}/api/members/${child.id}`, 'PATCH', first.token, {
      name: '小明同学', heightCm: 128.5, weightKg: 26.2, bloodType: 'A',
      waistCircumferenceCm: 58, bodyFatPercentage: 18.5, headCircumferenceCm: 51,
      rhBloodType: 'negative'
    })
    assert.equal(updatedResponse.status, 200)
    const updated = await updatedResponse.json()
    assert.equal(updated.name, '小明同学')
    assert.equal(updated.heightCm, 128.5)
    assert.equal(updated.weightKg, 26.2)
    assert.equal(updated.bloodType, 'A')
    assert.equal(updated.waistCircumferenceCm, 58)
    assert.equal(updated.bodyFatPercentage, 18.5)
    assert.equal(updated.headCircumferenceCm, 51)
    assert.equal(updated.rhBloodType, 'negative')

    const photoAvatar = `data:image/webp;base64,${'A'.repeat(20_000)}`
    const photoResponse = await requestJson(`${baseUrl}/api/members/${child.id}`, 'PATCH', first.token, { avatar: photoAvatar })
    assert.equal(photoResponse.status, 200)
    assert.equal((await photoResponse.json()).avatar, photoAvatar)

    const invalidPhotoResponse = await requestJson(`${baseUrl}/api/members/${child.id}`, 'PATCH', first.token, {
      avatar: `data:text/html;base64,${'A'.repeat(600)}`
    })
    assert.equal(invalidPhotoResponse.status, 400)
    assert.equal((await invalidPhotoResponse.json()).error.code, 'INVALID_AVATAR')

    const clearedResponse = await requestJson(`${baseUrl}/api/members/${child.id}`, 'PATCH', first.token, {
      heightCm: null, weightKg: null, bloodType: null, waistCircumferenceCm: null,
      bodyFatPercentage: null, headCircumferenceCm: null, rhBloodType: null
    })
    assert.equal(clearedResponse.status, 200)
    const cleared = await clearedResponse.json()
    assert.equal(cleared.heightCm, null)
    assert.equal(cleared.rhBloodType, null)

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
