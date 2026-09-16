import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium, webkit } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const origin = 'http://127.0.0.1:4196'
const password = 'simple-password'
let registrationSequence = 70

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForServer(server, output) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Auth lifecycle server stopped early:\n${output.join('')}`)
    try {
      const response = await fetch(`${origin}/api/health`)
      if (response.ok) return
    } catch { /* Continue until the bounded startup deadline. */ }
    await sleep(100)
  }
  throw new Error(`Auth lifecycle server did not become healthy:\n${output.join('')}`)
}

async function launch(browserType, directory, viewport = { width: 375, height: 667 }) {
  return browserType.launchPersistentContext(directory, { headless: true, viewport })
}

async function registerAndLogin(page, remember = true) {
  registrationSequence += 1
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${registrationSequence}` })
  const nickname = `生命周期${Date.now().toString().slice(-8)}${registrationSequence}`
  await page.goto(`${origin}/login`)
  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(nickname)
  await page.getByPlaceholder('设置一个密码').fill(password)
  await page.getByRole('button', { name: '注册并进入' }).click()
  await page.waitForURL(/nurse-station/)
  const accountId = await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.id)
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })

  await page.goto(`${origin}/login`)
  const rememberControl = page.getByRole('checkbox', { name: '记住登录信息' })
  if (!remember) await rememberControl.uncheck()
  await page.getByPlaceholder('输入密码').fill(password)
  const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/nickname/login'))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const response = await loginResponse
  assert.equal(response.headers()['x-hoooho-session-persistence'], remember ? 'persistent' : 'session')
  await page.waitForURL(/nurse-station/)
  return { accountId, nickname }
}

async function withProfile(prefix, operation) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  try { await operation(directory) }
  finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
}

async function rememberedRestart(browserType, label, viewport) {
  await withProfile(`hoooho-${label}-remembered-`, async (directory) => {
    let context = await launch(browserType, directory, viewport)
    let page = context.pages()[0] ?? await context.newPage()
    const { accountId, nickname } = await registerAndLogin(page, true)
    const cookie = (await context.cookies()).find((item) => item.name === 'hoooho_session')
    assert.ok(cookie?.expires > Date.now() / 1000, `${label}: login must issue a persistent cookie`)
    assert.equal(await page.evaluate(() => localStorage.getItem('lastLoginNickname')), nickname)
    assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes(password), `${label}: password leaked into local storage`)
    await context.close()

    context = await launch(browserType, directory, viewport)
    const reopenedCookie = (await context.cookies(origin)).find((item) => item.name === 'hoooho_session')
    assert.ok(reopenedCookie?.expires > Date.now() / 1000, `${label}: persistent cookie did not survive process restart`)
    page = context.pages()[0] ?? await context.newPage()
    await page.goto(`${origin}/`)
    await page.waitForURL(/nurse-station/)
    assert.equal(await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.id), accountId)
    await context.close()
  })
}

async function temporaryFailureRetry(browserType, label) {
  await withProfile(`hoooho-${label}-offline-`, async (directory) => {
    let context = await launch(browserType, directory)
    let page = context.pages()[0] ?? await context.newPage()
    await registerAndLogin(page, true)
    await context.close()

    context = await launch(browserType, directory)
    page = context.pages()[0] ?? await context.newPage()
    await page.route('**/api/auth/session', (route) => route.abort('internetdisconnected'))
    await page.goto(`${origin}/`)
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /暂时无法恢复使用状态/)
    assert.ok((await context.cookies(origin)).some((item) => item.name === 'hoooho_session'), `${label}: transient failure cleared the cookie`)
    await page.unroute('**/api/auth/session')
    await page.getByRole('button', { name: '重试' }).click()
    await page.waitForURL(/nurse-station/)
    await context.close()
  })
}

async function sessionOnlyDoesNotPersist(browserType, label) {
  await withProfile(`hoooho-${label}-session-only-`, async (directory) => {
    let context = await launch(browserType, directory)
    const page = context.pages()[0] ?? await context.newPage()
    await registerAndLogin(page, false)
    const cookie = (await context.cookies()).find((item) => item.name === 'hoooho_session')
    assert.equal(cookie?.expires, -1)
    await context.close()

    context = await launch(browserType, directory)
    assert.ok(!(await context.cookies(origin)).some((item) => item.name === 'hoooho_session'), `${label}: session-only cookie survived restart`)
    const reopenedPage = context.pages()[0] ?? await context.newPage()
    await reopenedPage.goto(`${origin}/`)
    await reopenedPage.waitForURL(/login/)
    await context.close()
  })
}

async function revokedSessionKeepsNickname(browserType, label) {
  await withProfile(`hoooho-${label}-nickname-`, async (directory) => {
    let context = await launch(browserType, directory)
    let page = context.pages()[0] ?? await context.newPage()
    const { nickname } = await registerAndLogin(page, true)
    const cookie = (await context.cookies(origin)).find((item) => item.name === 'hoooho_session')
    assert.ok(cookie)
    const revoked = await fetch(`${origin}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${cookie.name}=${cookie.value}`, Origin: origin, 'Content-Type': 'application/json' },
      body: '{}'
    })
    assert.equal(revoked.status, 200)
    await context.close()

    context = await launch(browserType, directory)
    page = context.pages()[0] ?? await context.newPage()
    await page.goto(`${origin}/`)
    await page.waitForURL(/login/)
    assert.equal(await page.getByPlaceholder('输入你的昵称').inputValue(), nickname)
    assert.equal(await page.getByPlaceholder('输入密码').inputValue(), '')
    assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes(password), `${label}: password leaked into local storage`)
    await context.close()
  })
}

const serverOutput = []
const server = spawn(process.execPath, ['tests/auth-account/serve.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
server.stdout.on('data', (chunk) => serverOutput.push(chunk.toString()))
server.stderr.on('data', (chunk) => serverOutput.push(chunk.toString()))

try {
  await waitForServer(server, serverOutput)
  for (const [browserType, label] of [[chromium, 'chromium'], [webkit, 'webkit']]) {
    await rememberedRestart(browserType, `${label}-iphone-se`, { width: 375, height: 667 })
    await temporaryFailureRetry(browserType, label)
    await sessionOnlyDoesNotPersist(browserType, label)
    await revokedSessionKeepsNickname(browserType, label)
  }
  await rememberedRestart(chromium, 'chromium-desktop', { width: 1280, height: 800 })
  console.info('Persistent lifecycle passed: Chromium + WebKit process restart, offline retry, session-only expiry, nickname fallback, desktop + iPhone SE.')
} finally {
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    sleep(5_000)
  ])
}
