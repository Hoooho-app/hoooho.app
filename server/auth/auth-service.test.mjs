import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { AuthError, AuthService } from './auth-service.mjs'
import { authApiPlugin } from './vite-auth-plugin.mjs'
import { EmailProviderError, ResendEmailVerificationProvider } from './providers/email-verification-provider.mjs'
import { assertAuthRuntimeConfig } from './config.mjs'

const createService = async (options = {}) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-auth-'))
  const messages = []
  const deliveries = []
  const service = new AuthService({
    dataDirectory,
    codeGenerator: () => '123456',
    logger: (message) => messages.push(message),
    tokenSecret: 'test-secret',
    emailProvider: { sendVerificationCode: async (payload) => deliveries.push(payload) },
    smsProvider: { sendVerificationCode: async (payload) => deliveries.push(payload) },
    ...options
  })
  return { service, messages, deliveries, cleanup: () => rm(dataDirectory, { recursive: true, force: true }) }
}

test('deployed runtime refuses the default token secret while local builds remain possible', () => {
  assert.doesNotThrow(() => assertAuthRuntimeConfig({ NODE_ENV: 'development' }))
  assert.throws(() => assertAuthRuntimeConfig({ NODE_ENV: 'production' }), /AUTH_TOKEN_SECRET/)
  assert.throws(() => assertAuthRuntimeConfig({ RAILWAY_ENVIRONMENT_ID: 'staging-id' }), /AUTH_TOKEN_SECRET/)
  assert.doesNotThrow(() => assertAuthRuntimeConfig({ RAILWAY_ENVIRONMENT_ID: 'production-id', AUTH_TOKEN_SECRET: 'configured-secret' }))
})

test('手机号验证码可以完成注册登录并且验证码仅可使用一次', async () => {
  const context = await createService()
  try {
    const sent = await context.service.sendCode('13812345678', 1_000)
    assert.equal(sent.retryAfter, 60)

    const session = await context.service.login('13812345678', '123456', 2_000)
    assert.equal(session.user.phone, '13812345678')
    assert.equal(session.token.split('.').length, 3)
    const members = await context.service.members.findByAccountId(session.user.id)
    assert.equal(members.length, 0)

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
    plugins: [authApiPlugin({
      dataDirectory,
      codeGenerator: () => '123456',
      logger: () => undefined,
      tokenSecret: 'test-secret',
      emailProvider: { sendVerificationCode: async () => undefined },
      smsProvider: { sendVerificationCode: async () => undefined }
    })]
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

    const emailSendResponse = await fetch(`${baseUrl}/api/auth/email/send-code`, {
      method: 'POST', headers, body: JSON.stringify({ email: ' Api.User@Example.COM ' })
    })
    assert.equal(emailSendResponse.status, 200)

    const emailLoginResponse = await fetch(`${baseUrl}/api/auth/email/login`, {
      method: 'POST', headers, body: JSON.stringify({ email: 'api.user@example.com', code: '123456' })
    })
    assert.equal(emailLoginResponse.status, 200)
    const emailSession = await emailLoginResponse.json()
    assert.equal(emailSession.user.email, 'api.user@example.com')
    assert.ok(emailSession.token)
  } finally {
    await server.close()
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

test('邮箱验证码会标准化邮箱并首次自动注册，但不会伪造本人档案', async () => {
  const context = await createService()
  try {
    const result = await context.service.sendEmailCode(' Test.User@Example.COM ', 1_000)
    assert.deepEqual(result, { success: true, expiresIn: 300, retryAfter: 60 })
    assert.equal(context.deliveries.length, 1)
    assert.equal(context.deliveries[0].email, 'test.user@example.com')
    assert.equal(context.deliveries[0].code, '123456')

    const session = await context.service.loginWithEmail('test.user@example.com', '123456', 2_000)
    assert.equal(session.user.email, 'test.user@example.com')
    assert.equal(session.user.phone, undefined)
    const members = await context.service.members.findByAccountId(session.user.id)
    assert.equal(members.length, 0)
    assert.equal(context.messages.some((message) => message.includes('123456')), false)
    assert.equal(context.messages.some((message) => message.includes('Test.User')), false)
  } finally {
    await context.cleanup()
  }
})

test('同一邮箱重复登录返回同一用户且验证码仅可使用一次', async () => {
  const context = await createService()
  try {
    await context.service.sendEmailCode('same@example.com', 1_000)
    const first = await context.service.loginWithEmail('same@example.com', '123456', 2_000)
    await assert.rejects(
      context.service.loginWithEmail('same@example.com', '123456', 3_000),
      (error) => error instanceof AuthError && error.code === 'CODE_NOT_FOUND'
    )
    await context.service.sendEmailCode('same@example.com', 62_000)
    const second = await context.service.loginWithEmail('same@example.com', '123456', 63_000)
    assert.equal(second.user.id, first.user.id)
  } finally {
    await context.cleanup()
  }
})

test('Operations 邮箱验证码只发送给规范化后的唯一管理员', async () => {
  const context = await createService({ opsOwnerEmail: ' Owner@Example.com ' })
  try {
    const decoy = await context.service.sendOpsEmailCode('other@example.com', 1_000)
    assert.deepEqual(decoy, { success: true, expiresIn: 300, retryAfter: 60 })
    assert.equal(context.deliveries.length, 0)
    assert.equal(await context.service.codes.find('ops-email', 'other@example.com'), null)

    await context.service.sendOpsEmailCode(' OWNER@example.COM ', 2_000)
    assert.equal(context.deliveries.length, 1)
    assert.equal(context.deliveries[0].email, 'owner@example.com')
    const session = await context.service.loginOpsWithEmail('owner@example.com', '123456', 3_000)
    assert.equal(session.user.email, 'owner@example.com')
  } finally {
    await context.cleanup()
  }
})

test('Operations 拒绝加号别名、相似邮箱并在缺少 owner 配置时关闭', async () => {
  const context = await createService({ opsOwnerEmail: 'owner@example.com' })
  try {
    for (const email of ['owner+ops@example.com', 'owners@example.com', 'owner@example.co']) {
      await context.service.sendOpsEmailCode(email, 1_000)
      assert.equal(context.deliveries.length, 0)
      await assert.rejects(context.service.loginOpsWithEmail(email, '123456', 2_000), (error) => error instanceof AuthError && error.code === 'OPS_FORBIDDEN')
    }
    context.service.config.opsOwnerEmail = ''
    await assert.rejects(context.service.sendOpsEmailCode('owner@example.com', 3_000), (error) => error instanceof AuthError && error.status === 503 && error.code === 'OPS_OWNER_NOT_CONFIGURED')
  } finally {
    await context.cleanup()
  }
})

test('邮箱验证码支持限流、过期与格式校验', async () => {
  const context = await createService()
  try {
    await assert.rejects(
      context.service.sendEmailCode('not-an-email', 1_000),
      (error) => error instanceof AuthError && error.code === 'INVALID_EMAIL'
    )
    await context.service.sendEmailCode('valid@example.com', 1_000)
    await assert.rejects(
      context.service.sendEmailCode('VALID@example.com', 2_000),
      (error) => error instanceof AuthError && error.code === 'CODE_RATE_LIMITED'
    )
    await assert.rejects(
      context.service.loginWithEmail('valid@example.com', '123456', 301_000),
      (error) => error instanceof AuthError && error.code === 'CODE_EXPIRED'
    )
  } finally {
    await context.cleanup()
  }
})

test('邮箱验证码连续错误五次后立即失效', async () => {
  const context = await createService()
  try {
    await context.service.sendEmailCode('attempts@example.com', 1_000)
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await assert.rejects(
        context.service.loginWithEmail('attempts@example.com', '654321', 1_000 + attempt),
        (error) => error instanceof AuthError && error.code === 'CODE_INCORRECT'
      )
    }
    await assert.rejects(
      context.service.loginWithEmail('attempts@example.com', '654321', 1_005),
      (error) => error instanceof AuthError && error.code === 'CODE_ATTEMPTS_EXCEEDED'
    )
    await assert.rejects(
      context.service.loginWithEmail('attempts@example.com', '123456', 1_006),
      (error) => error instanceof AuthError && error.code === 'CODE_NOT_FOUND'
    )
  } finally {
    await context.cleanup()
  }
})

test('邮箱 provider 失败或未配置时不保留有效验证码', async () => {
  for (const providerError of [
    new Error('network failed'),
    new EmailProviderError('not configured', 'EMAIL_PROVIDER_NOT_CONFIGURED')
  ]) {
    const context = await createService({
      emailProvider: { sendVerificationCode: async () => { throw providerError } }
    })
    try {
      await assert.rejects(
        context.service.sendEmailCode('failure@example.com', 1_000),
        (error) => error instanceof AuthError && error.code === (
          providerError instanceof EmailProviderError ? 'EMAIL_PROVIDER_NOT_CONFIGURED' : 'EMAIL_PROVIDER_UNAVAILABLE'
        )
      )
      assert.equal(await context.service.codes.find('email', 'failure@example.com'), null)
    } finally {
      await context.cleanup()
    }
  }
})

test('Resend provider 对限流和网络错误进行稳定分类', async () => {
  const rateLimitedProvider = new ResendEmailVerificationProvider({
    apiKey: 'test-key',
    from: 'Hoooho <login@example.com>',
    fetch: async () => ({ ok: false, status: 429 })
  })
  await assert.rejects(
    rateLimitedProvider.sendVerificationCode({ email: 'user@example.com', code: '123456', expiresIn: 300 }),
    (error) => error instanceof EmailProviderError && error.code === 'EMAIL_PROVIDER_RATE_LIMITED'
  )

  const networkProvider = new ResendEmailVerificationProvider({
    apiKey: 'test-key',
    from: 'Hoooho <login@example.com>',
    fetch: async () => { throw new TypeError('network failed') }
  })
  await assert.rejects(
    networkProvider.sendVerificationCode({ email: 'user@example.com', code: '123456', expiresIn: 300 }),
    (error) => error instanceof EmailProviderError && error.code === 'EMAIL_PROVIDER_NETWORK_ERROR'
  )
})
test('Resend provider 使用受控发件人和纯登录验证码邮件', async () => {
  const requests = []
  const provider = new ResendEmailVerificationProvider({
    apiKey: 'test-key',
    from: 'Hoooho <login@example.com>',
    fetch: async (url, options) => {
      requests.push({ url, options })
      return { ok: true }
    }
  })

  await provider.sendVerificationCode({ email: 'user@example.com', code: '123456', expiresIn: 300 })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://api.resend.com/emails')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-key')
  const body = JSON.parse(requests[0].options.body)
  assert.equal(body.from, 'Hoooho <login@example.com>')
  assert.deepEqual(body.to, ['user@example.com'])
  assert.equal(body.subject, 'Hoooho 登录验证码')
  assert.match(body.text, /你的 Hoooho 登录验证码是/)
  assert.match(body.text, /123456/)
  assert.match(body.text, /5 分钟内有效/)
})
