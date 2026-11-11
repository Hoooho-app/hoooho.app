import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AccountService } from '../account/account-service.mjs'
import { AuthService } from '../auth/auth-service.mjs'
import { cardsAccountPrefix, handleCardsAccount } from './api.mjs'
import { CardsAppleBindings } from './apple-sign-in.mjs'
import { CardsAccountService } from './cards-account-service.mjs'

async function setup(t, apple = null) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-cards-account-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const codes = new Map()
  let sequence = 100_000
  const auth = new AuthService({
    dataDirectory,
    tokenSecret: 'unit-test-records-secret',
    codeGenerator: () => String(++sequence),
    emailProvider: { sendVerificationCode: ({ email, code }) => { codes.set(email, code) } },
    smsProvider: { sendVerificationCode: ({ phone, code }) => { codes.set(phone, code) } },
    logger: () => {}
  })
  const appleBindings = new CardsAppleBindings(dataDirectory)
  const account = new AccountService({
    dataDirectory, tokenSecret: auth.config.tokenSecret, auth, cardsAppleBindings: appleBindings,
    revokeCardsApple: apple ? binding => apple.revoke(binding) : null
  })
  const service = new CardsAccountService({
    auth, account, secret: 'unit-test-cards-only-secret-not-for-production', apple, appleBindings
  })
  return { dataDirectory, codes, auth, service, appleBindings }
}

test('Cards verifies separate codes, reuses the same identity, and issues no Records bearer', async t => {
  const { dataDirectory, codes, auth, service } = await setup(t)
  const email = 'synthetic.cards@example.test'
  const now = Date.now()
  const existing = await auth.users.findOrCreateByEmail(email)
  await auth.sendEmailCode(email, now)
  const recordsCode = codes.get(email)
  await assert.rejects(service.login('email', email, recordsCode, now), { code: 'CODE_NOT_FOUND' })

  await service.sendCode('email', email, 'login', 'client', now)
  const cardsCode = codes.get(email)
  await assert.rejects(auth.loginWithEmail(email, cardsCode, now), { code: 'CODE_INCORRECT' })
  const session = await service.login('email', 'SYNTHETIC.CARDS@example.test', cardsCode, now)
  assert.equal(session.scope, 'cards:account')
  assert.equal(session.user.id, existing.id)
  assert.equal(session.user.email, email)
  assert.equal(session.token, undefined)
  assert.equal(session.user.currentMemberId, undefined)
  assert.equal(auth.tokens.verify(session.credential, now), null)
  assert.deepEqual(await service.restore(auth.tokens.create(existing, now), now), { unauthenticated: true })
  assert.deepEqual(await service.restore(session.credential, now), { scope: session.scope, method: 'email', user: session.user })
  assert.deepEqual(await service.restore(session.credential, now + 31 * 86_400_000), { unauthenticated: true })
  await assert.rejects(service.login('email', email, cardsCode, now), { code: 'CODE_NOT_FOUND' })
  const stored = await readFile(path.join(dataDirectory, 'cards-account-sessions.json'), 'utf8')
  assert(!stored.includes(session.credential))
  assert(!stored.includes(email))
})

test('binding respects scope, verifies both addresses, and shared deletion requires explicit consent', async t => {
  const { codes, auth, service } = await setup(t)
  const oldEmail = 'old.cards@example.test'
  const newEmail = 'new.cards@example.test'
  const phone = '13912345678'
  let now = Date.now()
  await service.sendCode('email', oldEmail, 'login', 'first', now)
  const loginCode = codes.get(oldEmail)
  const first = await service.login('email', oldEmail, loginCode, now)
  now += 61_000

  await service.sendBindingCode(first.credential, { kind: 'phone', value: phone, purpose: 'bind' }, 'second', now)
  await assert.rejects(service.login('phone', phone, codes.get(phone), now), { code: 'CODE_NOT_FOUND' })
  const bound = await service.bind(first.credential, { kind: 'phone', value: phone, code: codes.get(phone) }, now)
  assert.equal(bound.phone, phone)
  assert.equal((await auth.users.findByPhone(phone)).id, first.user.id)

  await service.sendBindingCode(first.credential, { kind: 'email', value: newEmail, purpose: 'bind' }, 'third', now)
  const newCode = codes.get(newEmail)
  await assert.rejects(service.bind(first.credential, { kind: 'email', value: newEmail, code: newCode }, now), { code: 'CURRENT_CONTACT_REQUIRED' })
  await service.sendBindingCode(first.credential, { kind: 'email', value: newEmail, purpose: 'verify-current' }, 'fourth', now)
  assert.equal(codes.get(newEmail), newCode)
  const { changeToken } = await service.verifyCurrent(first.credential, { kind: 'email', code: codes.get(oldEmail) }, now)
  assert.equal(auth.tokens.verify(changeToken, now), null)
  const changed = await service.bind(first.credential, { kind: 'email', value: newEmail, code: newCode, changeToken }, now)
  assert.equal(changed.email, newEmail)
  assert.equal(await auth.users.findByEmail(oldEmail), null)

  now += 61_000
  await service.sendCode('phone', phone, 'login', 'another', now)
  const second = await service.login('phone', phone, codes.get(phone), now)
  assert.equal(second.user.id, first.user.id)

  await service.sendDeletionCode(first.credential, { kind: 'email' }, 'delete-first', now)
  const { deleteToken } = await service.verifyDeletion(first.credential, { kind: 'email', code: codes.get(newEmail) }, now)
  await assert.rejects(service.delete(first.credential, { deleteToken }, now), { code: 'DELETE_SCOPE_REQUIRED' })
  await assert.rejects(service.delete(second.credential, { deleteToken, scopeConfirmation: 'all-hoooho-apps' }, now), { code: 'DELETE_VERIFICATION_REQUIRED' })
  assert((await service.delete(first.credential, { deleteToken, scopeConfirmation: 'all-hoooho-apps' }, now)).deleted)
  assert.equal(await auth.users.findById(first.user.id), null)
  assert.deepEqual(await service.restore(second.credential, now), { unauthenticated: true })
})

test('endpoint defaults closed and validates route, request method and content type', async () => {
  const noCalls = () => { throw new Error('unexpected body or response') }
  const request = { method: 'POST', headers: {} }
  const dependencies = { service: {}, readJson: noCalls, sendJson: noCalls }
  assert.equal(await handleCardsAccount(request, {}, '/api/auth/session', dependencies), false)
  await assert.rejects(handleCardsAccount(request, {}, cardsAccountPrefix + 'session', { ...dependencies, service: null }), { code: 'CARDS_ACCOUNT_DISABLED' })
  await assert.rejects(handleCardsAccount(request, {}, cardsAccountPrefix + 'health', dependencies), { code: 'NOT_FOUND' })
  await assert.rejects(handleCardsAccount(request, {}, cardsAccountPrefix + 'login/password', dependencies), { code: 'NOT_FOUND' })
  await assert.rejects(handleCardsAccount(request, {}, cardsAccountPrefix + 'session', dependencies), { code: 'METHOD_NOT_ALLOWED' })
  await assert.rejects(handleCardsAccount(request, {}, cardsAccountPrefix + 'contacts/bind', dependencies), { code: 'JSON_REQUIRED' })
})

test('logging out revokes only the current Cards session', async t => {
  const { codes, auth, service } = await setup(t)
  const email = 'logout.cards@example.test'
  let now = Date.now()
  await service.sendCode('email', email, 'login', 'one', now)
  const first = await service.login('email', email, codes.get(email), now)
  now += 61_000
  await service.sendCode('email', email, 'login', 'two', now)
  const second = await service.login('email', email, codes.get(email), now)
  const record = await auth.users.findById(first.user.id)
  const webToken = auth.tokens.create(record, now)
  assert.deepEqual(await service.logout(first.credential, now), { success: true })
  assert.deepEqual(await service.logout(first.credential, now), { success: true })
  assert.deepEqual(await service.restore(first.credential, now), { unauthenticated: true })
  assert.equal((await service.restore(second.credential, now)).user.id, first.user.id)
  assert.equal(auth.tokens.verify(webToken, now).sub, first.user.id)
})

test('Apple creates a scoped identity and binds only when the current account explicitly authorizes it', async t => {
  const usedCodes = new Set()
  const revoked = []
  const apple = {
    async exchange(code, identityToken, nonce) {
      assert.equal(identityToken, nonce)
      if (usedCodes.has(code)) throw Object.assign(new Error('Already exchanged'), { code: 'APPLE_AUTHORIZATION_INVALID' })
      usedCodes.add(code)
      return { subject: code.split(':')[0], refreshToken: 'sealed-authorization',
        ...(code.endsWith(':bind') ? { emailHint: 'a•••@example.test' } : {}) }
    },
    async revoke(binding) { revoked.push(binding) }
  }
  const { service, auth, appleBindings, codes } = await setup(t, apple)
  const now = Date.now()
  assert.deepEqual(service.capabilities(), { email: true, phone: true, apple: true, entryIntents: true })
  await assert.rejects(service.beginApple('', { action: 'bind' }, now), { code: 'UNAUTHORIZED' })

  const performApple = async (credential, action, code, client = 'apple-test') => {
    const { nonce, challengeToken } = await service.beginApple(credential, { action }, now)
    return service.finishApple(credential, { action, code, challengeToken, identityToken: nonce }, client, now)
  }
  const appleUser = await performApple('', 'login', 'subject-a:first')
  assert.equal(appleUser.method, 'apple')
  assert.equal(appleUser.user.appleLinked, true)
  assert.equal(appleUser.user.email, undefined)
  assert.equal(auth.tokens.verify(appleUser.credential, now), null)
  assert.equal((await performApple('', 'login', 'subject-a:return')).user.id, appleUser.user.id)
  await assert.rejects(performApple('', 'login', 'subject-a:return'), { code: 'APPLE_AUTHORIZATION_INVALID' })

  const email = 'apple-bind@example.test'
  await service.sendCode('email', email, 'login', 'mail-test', now)
  const emailUser = await service.login('email', email, codes.get(email), now)
  await assert.rejects(performApple(emailUser.credential, 'bind', 'subject-a:collision'), { code: 'APPLE_IDENTITY_IN_USE' })
  const bound = await performApple(emailUser.credential, 'bind', 'subject-b:bind')
  assert.equal(bound.id, emailUser.user.id)
  assert.equal(bound.appleLinked, true)
  assert.equal(bound.appleEmailHint, 'a•••@example.test')
  assert.equal((await service.restore(emailUser.credential, now)).method, 'email')
  assert.equal(bound.refreshToken, undefined)
  assert.equal((await auth.users.findById(bound.id)).cardsApple, undefined)
  const second = await performApple('', 'login', 'subject-b:sign-in')
  assert.equal(second.user.id, bound.id)
  assert.equal(second.method, 'apple')
  assert.equal(second.user.appleEmailHint, bound.appleEmailHint)

  const loginChallenge = await service.beginApple('', { action: 'login' }, now)
  await assert.rejects(service.finishApple(second.credential, {
    ...loginChallenge, action: 'delete', code: 'subject-b:wrong-purpose', identityToken: loginChallenge.nonce
  }, 'apple-test', now), { code: 'APPLE_CHALLENGE_INVALID' })
  await assert.rejects(performApple(second.credential, 'delete', 'subject-a:wrong-account'), { code: 'APPLE_ACCOUNT_MISMATCH' })
  const { deleteToken } = await performApple(second.credential, 'delete', 'subject-b:delete')
  await assert.rejects(service.delete(emailUser.credential, { deleteToken, scopeConfirmation: 'all-hoooho-apps' }, now),
    { code: 'DELETE_VERIFICATION_REQUIRED' })
  assert.equal((await service.delete(second.credential, { deleteToken, scopeConfirmation: 'all-hoooho-apps' }, now)).deleted, true)
  assert.equal(revoked[0].subject, 'subject-b')
  assert.equal(await appleBindings.forSubject('subject-b'), undefined)
  assert.equal(await auth.users.findById(bound.id), null)
  assert.deepEqual(await service.restore(emailUser.credential, now), { unauthenticated: true })
  assert.equal((await service.restore(appleUser.credential, now)).user.id, appleUser.user.id)
})

test('explicit login and registration can switch using the verified code while keeping one account and its login method', async t => {
  const { service, codes, auth } = await setup(t)
  const email = 'flow@example.test'
  const phone = '13812345678'
  const now = Date.now()

  await service.sendCode('email', email, 'login', 'first-device', now)
  const firstCode = codes.get(email)
  await assert.rejects(service.login('email', email, firstCode, now, 'login'), { code: 'ACCOUNT_SIGN_UP_REQUIRED' })
  assert.equal(await auth.users.findByEmail(email), null)
  const created = await service.login('email', email, firstCode, now, 'register')
  assert.equal(created.method, 'email')
  assert.equal(created.user.email, email)
  await assert.rejects(service.login('email', email, firstCode, now, 'register'), { code: 'CODE_NOT_FOUND' })

  const later = now + 61_000
  await service.sendCode('email', email, 'login', 'second-device', later)
  const secondCode = codes.get(email)
  await assert.rejects(service.login('email', email, secondCode, later, 'register'), { code: 'ACCOUNT_ALREADY_REGISTERED' })
  const signedIn = await service.login('email', email, secondCode, later, 'login')
  assert.equal(signedIn.user.id, created.user.id)

  await service.sendBindingCode(signedIn.credential, {kind: 'phone', value: phone, purpose: 'bind'}, 'second-device', later)
  const bound = await service.bind(signedIn.credential, {kind: 'phone', value: phone, code: codes.get(phone)}, later)
  assert.equal(bound.phone, phone)
  const afterBinding = await service.restore(signedIn.credential, later)
  assert.equal(afterBinding.method, 'email')
  assert.equal(afterBinding.user.phone, phone)

  const phoneTime = later + 61_000
  await service.sendCode('phone', phone, 'login', 'third-device', phoneTime)
  const phoneLogin = await service.login('phone', phone, codes.get(phone), phoneTime, 'login')
  assert.equal(phoneLogin.method, 'phone')
  assert.equal(phoneLogin.user.id, created.user.id)
  assert.equal((await service.restore(phoneLogin.credential, phoneTime)).method, 'phone')
})

test('Apple challenges stay bound to the selected login or registration flow', async t => {
  const { service, appleBindings } = await setup(t, {
    async exchange(code, identityToken, nonce) {
      assert.equal(identityToken, nonce)
      return { subject: 'apple-flow', refreshToken: 'sealed' }
    }
  })
  const now = Date.now()
  const challenge = async intent => ({ ...await service.beginApple('', { action: 'login', intent }, now), action: 'login', intent })
  const verify = input => service.finishApple('', { ...input, identityToken: input.nonce, code: 'synthetic-code' }, 'apple-device', now)
  const login = await challenge('login')
  await assert.rejects(verify({ ...login, intent: 'register' }), { code: 'APPLE_CHALLENGE_INVALID' })
  await assert.rejects(verify(login), { code: 'ACCOUNT_SIGN_UP_REQUIRED' })
  assert.equal(await appleBindings.forSubject('apple-flow'), undefined)
  const registered = await verify(await challenge('register'))
  assert.equal(registered.method, 'apple')
  await assert.rejects(verify(await challenge('register')), { code: 'ACCOUNT_ALREADY_REGISTERED' })
  const signedIn = await verify(await challenge('login'))
  assert.equal(signedIn.user.id, registered.user.id)
})

test('the Cards HTTP route forwards explicit entry intent and restores the issued method', async t => {
  const { service, codes } = await setup(t)
  const call = async (path, body, credential) => {
    const request = {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(credential ? { authorization: 'Bearer ' + credential } : {})
      }
    }
    let result
    assert.equal(await handleCardsAccount(request, {}, cardsAccountPrefix + path, {
      service,
      readJson: async () => body,
      sendJson: (_response, status, payload) => { result = { status, payload } }
    }), true)
    assert.equal(result.status, 200)
    return result.payload
  }
  const value = 'entry-route@example.test'
  assert.equal((await call('capabilities')).entryIntents, true)
  await call('login/send-code', { kind: 'email', value })
  const input = { kind: 'email', value, code: codes.get(value) }
  await assert.rejects(call('login/verify', { ...input, intent: 'login' }), { code: 'ACCOUNT_SIGN_UP_REQUIRED' })
  const session = await call('login/verify', { ...input, intent: 'register' })
  assert.equal(session.method, 'email')
  assert.deepEqual(await call('session', null, session.credential), {
    scope: session.scope, method: session.method, user: session.user
  })
})
