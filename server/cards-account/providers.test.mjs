import assert from 'node:assert/strict'
import { createHash, createHmac, generateKeyPairSync, sign, verify } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { CardsAppleSignIn } from './apple-sign-in.mjs'
import { CardsSMSProvider, createCardsSMSProvider } from './sms-provider.mjs'

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')

test('Apple verifies the signature, nonce, app audience, expiry, and exchanged subject before retaining a revocable token', async () => {
  const now = Date.now()
  const epoch = Math.floor(now / 1000)
  const client = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const apple = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwt = (claims = {}, key = apple.privateKey) => {
    const value = `${encode({ alg: 'RS256', kid: 'apple-test-key' })}.${encode({
      iss: 'https://appleid.apple.com', aud: 'com.hoooho.cards', exp: epoch + 300, iat: epoch,
      sub: 'test-subject', nonce: 'valid-challenge', ...claims
    })}`
    return `${value}.${sign('RSA-SHA256', Buffer.from(value), key).toString('base64url')}`
  }
  const calls = []
  let exchangedSubject = 'test-subject'
  const provider = new CardsAppleSignIn({
    teamId: 'TEAMTEST01', keyId: 'KEYTEST001', key: client.privateKey, secret: 'unit-test-token-encryption-secret',
    fetch: async (url, options) => {
      const pathname = new URL(url).pathname
      calls.push(pathname)
      assert.equal(options.redirect, 'error')
      if (pathname === '/auth/keys') {
        return Response.json({ keys: [{ ...apple.publicKey.export({ format: 'jwk' }), alg: 'RS256', kid: 'apple-test-key', use: 'sig' }] })
      }
      assert.equal(options.body.get('client_id'), 'com.hoooho.cards')
      const [header, payload, signature] = options.body.get('client_secret').split('.')
      assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).iss, 'TEAMTEST01')
      assert(verify('sha256', Buffer.from(`${header}.${payload}`),
        { key: client.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')))
      if (pathname === '/auth/revoke') {
        assert.equal(options.body.get('token'), 'synthetic-refresh-token')
        return new Response(null, { status: 200 })
      }
      assert.equal(options.body.get('grant_type'), 'authorization_code')
      return Response.json({ id_token: jwt({ sub: exchangedSubject, nonce: undefined }), refresh_token: 'synthetic-refresh-token' })
    }
  })
  for (const claims of [{ nonce: 'old-challenge' }, { aud: 'other.app' }, { exp: epoch - 1 }, { iss: 'https://other.test' }]) {
    await assert.rejects(provider.exchange('code', jwt(claims), 'valid-challenge', now), { code: 'APPLE_AUTHORIZATION_INVALID' })
  }
  await assert.rejects(provider.exchange('code', jwt({}, client.privateKey), 'valid-challenge', now), { code: 'APPLE_AUTHORIZATION_INVALID' })
  assert.deepEqual(calls, ['/auth/keys'])
  exchangedSubject = 'other-subject'
  await assert.rejects(provider.exchange('code', jwt(), 'valid-challenge', now), { code: 'APPLE_AUTHORIZATION_INVALID' })
  exchangedSubject = 'test-subject'
  const binding = await provider.exchange('code', jwt(), 'valid-challenge', now)
  assert.equal(binding.subject, 'test-subject')
  assert.notEqual(binding.refreshToken, 'synthetic-refresh-token')
  await provider.revoke(binding)
  assert.equal(calls.at(-1), '/auth/revoke')
})

test('Cards SMS signs a PNVS request and keeps the paid send ceiling across provider restarts', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cards-sms-provider-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  assert.equal(createCardsSMSProvider(directory, {}), null)
  let deliveries = 0
  const config = {
    dataDirectory: directory, accessKeyId: 'test-key', accessKeySecret: 'test-secret',
    signName: '测试签名', templateCode: '100001', dailyLimit: 1,
    fetch: async (url, options) => {
      deliveries += 1
      const parsed = new URL(url)
      assert.equal(parsed.hostname, 'dypnsapi.aliyuncs.com')
      assert.equal(options.method, 'POST')
      assert.equal(options.redirect, 'error')
      assert.equal(parsed.searchParams.get('TemplateCode'), '100001')
      assert.deepEqual(JSON.parse(parsed.searchParams.get('TemplateParam')), { code: '123456', min: '5' })
      const algorithm = 'ACS3-HMAC-SHA256'
      const names = 'host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version'
      const canonical = ['POST', '/', parsed.search.slice(1),
        names.split(';').map(name => `${name}:${options.headers[name]}\n`).join(''),
        names, createHash('sha256').digest('hex')].join('\n')
      const digest = createHash('sha256').update(canonical).digest('hex')
      const signature = createHmac('sha256', 'test-secret').update(`${algorithm}\n${digest}`).digest('hex')
      assert.equal(options.headers.Authorization, `${algorithm} Credential=test-key,SignedHeaders=${names},Signature=${signature}`)
      return Response.json({ Code: 'OK', Success: true })
    }
  }
  const message = { phone: '13912345678', code: '123456', expiresIn: 300 }
  await new CardsSMSProvider(config).sendVerificationCode(message, new Date('2026-11-11T12:00:00Z'))
  const restarted = new CardsSMSProvider(config)
  await assert.rejects(restarted.sendVerificationCode({ ...message, phone: '13812345678' }, new Date('2026-11-11T12:30:00Z')),
    { code: 'SMS_DAILY_LIMIT' })
  assert.equal(deliveries, 1)
  await restarted.sendVerificationCode(message, new Date('2026-11-12T00:00:00Z'))
  assert.equal(deliveries, 2)
})
