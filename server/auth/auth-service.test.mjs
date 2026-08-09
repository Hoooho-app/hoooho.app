import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { AuthError, AuthService } from './auth-service.mjs'
import { authApiPlugin } from './vite-auth-plugin.mjs'

const createService = async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-auth-'))
  const messages = []
  const service = new AuthService({
    dataDirectory,
    codeGenerator: () => '123456',
    logger: (message) => messages.push(message),
    tokenSecret: 'test-secret'
  })
  return { service, messages, cleanup: () => rm(dataDirectory, { recursive: true, force: true }) }
}

test('手机号验证码可以完成注册登录并且验证码仅可使用一次', async () => {
  const context = await createService()
  try {
    const sent = await context.service.sendCode('13812345678', 1_000)
    assert.equal(sent.retryAfter, 60)
    assert.match(context.messages[0], /code=123456/)

    const session = await context.service.login('13812345678', '123456', 2_000)
    assert.equal(session.user.phone, '13812345678')
    assert.equal(session.token.split('.').length, 3)
    const members = await context.service.members.findByAccountId(session.user.id)
    assert.equal(members.length, 1)
    assert.equal(members[0].name, '我')
    assert.equal(members[0].relationship, 'self')
    assert.equal(members[0].isSelf, true)

    await assert.rejects(
      context.service.login('13812345678', '123456', 3_000),
      (error) => error instanceof AuthError && error.code === 'CODE_NOT_FOUND'
    )
  } finally {
    await context.cleanup()
  }
})

test('验证码发送限流、错误验证码和过期验证码均被拒绝', async () => {
  const context = await createService()
  try {
    await context.service.sendCode('13912345678', 1_000)
    await assert.rejects(
      context.service.sendCode('13912345678', 2_000),
      (error) => error instanceof AuthError && error.code === 'CODE_RATE_LIMITED'
    )
    await assert.rejects(
      context.service.login('13912345678', '654321', 3_000),
      (error) => error instanceof AuthError && error.code === 'CODE_INCORRECT'
    )
    await assert.rejects(
      context.service.login('13912345678', '123456', 1_000 + 5 * 60 * 1000),
      (error) => error instanceof AuthError && error.code === 'CODE_EXPIRED'
    )
  } finally {
    await context.cleanup()
  }
})

test('Vite 同源 API 可以完成发送验证码与登录', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-auth-api-'))
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 5194, strictPort: false },
    plugins: [authApiPlugin({ dataDirectory, codeGenerator: () => '123456', logger: () => undefined, tokenSecret: 'test-secret' })]
  })
  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const headers = { 'Content-Type': 'application/json' }

    const sendResponse = await fetch(`${baseUrl}/api/auth/send-code`, {
      method: 'POST', headers, body: JSON.stringify({ phone: '13712345678' })
    })
    assert.equal(sendResponse.status, 200)

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers, body: JSON.stringify({ phone: '13712345678', code: '123456' })
    })
    assert.equal(loginResponse.status, 200)
    const session = await loginResponse.json()
    assert.equal(session.user.phone, '13712345678')
    assert.ok(session.token)
  } finally {
    await server.close()
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
