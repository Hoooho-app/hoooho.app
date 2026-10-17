import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authApiPlugin } from './vite-auth-plugin.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const fixtures = [
  { nickname: '结构类型账号', password: 'correct-password', inputs: [
    { nickname: ['结构类型账号'], password: 'correct-password' },
    { nickname: '结构类型账号', password: ['correct-password'] },
    { nickname: ['结构类型账号'], password: ['correct-password'] },
    { nickname: '结构类型账号', password: true },
    { nickname: '结构类型账号', password: false }
  ] },
  { nickname: 'true', password: '123456', inputs: [
    { nickname: true, password: '123456' },
    { nickname: 'true', password: 123456 }
  ] },
  { nickname: '对象密码', password: '[object Object]', inputs: [
    { nickname: '对象密码', password: {} }
  ] }
]

async function check(base, logs) {
  async function post(route, input) {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    return { status: response.status, body: await response.json() }
  }
  for (const fixture of fixtures) {
    const registered = await post('/api/auth/register', { nickname: fixture.nickname, password: fixture.password, idempotencyKey: randomUUID() })
    assert.equal(registered.status, 200)
    for (const input of fixture.inputs) {
      const rejected = await post('/api/auth/nickname/login', input)
      assert.equal(rejected.status, 401, `invalid raw nickname/password types: ${typeof input.nickname}/${typeof input.password}`)
      assert.equal(rejected.body.error?.code, 'INVALID_CREDENTIALS')
      assert.equal(rejected.body.token, undefined)
    }
    // Rejected shapes must not consume the valid account's password-attempt budget.
    const accepted = await post('/api/auth/nickname/login', { nickname: fixture.nickname, password: fixture.password })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.user.id, registered.body.user.id)
    assert.equal(typeof accepted.body.token, 'string')
    assert.equal((logs() ?? '').includes(fixture.password), false, 'password plaintext must not enter application logs')
  }
}

async function nativeVite(t, directory) {
  const handlers = [], messages = []
  authApiPlugin({ dataDirectory: directory, tokenSecret: 'synthetic-http-types-secret', logger: line => messages.push(line), emailProvider: { async sendVerificationCode() { throw new Error('Email is outside this test') } } }).configureServer({ middlewares: { use: handler => handlers.push(handler) }, config: { logger: { error: error => messages.push(String(error)) } } })
  const server = createServer((request, response) => {
    let index = 0
    const next = () => {
      const handler = handlers[index++]
      if (!handler) { response.statusCode = 404; response.end('{}'); return }
      Promise.resolve(handler(request, response, next)).catch(error => { response.statusCode = 500; response.end(JSON.stringify({ error: { code: error.code ?? 'INTERNAL_ERROR' } })) })
    }
    next()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return { base: `http://127.0.0.1:${server.address().port}`, logs: () => messages.join('\n') }
}

async function production(t, directory) {
  // Execute the real production dispatcher once. Port zero and a listen hook
  // avoid fixed ports; this child never contacts an email/AI upstream.
  const bootstrap = `import {Server} from 'node:net';
    const listen=Server.prototype.listen;
    Server.prototype.listen=function(...args){this.once('listening',()=>process.stdout.write('HTTP_TYPES_PORT='+this.address().port+'\\n'));return listen.apply(this,args)};
    globalThis.fetch=async()=>{throw new Error('External fetch is outside this test')};
    await import('./server/app.mjs');`
  const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], { cwd: root, env: { PATH: process.env.PATH, TZ: 'Asia/Shanghai', NODE_ENV: 'production', AUTH_TOKEN_SECRET: 'synthetic-http-types-secret', DATA_DIRECTORY: directory, HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let messages = ''
  child.stdout.on('data', data => { messages += data })
  child.stderr.on('data', data => { messages += data })
  t.after(async () => {
    if (child.exitCode !== null) return
    await new Promise(resolve => { const timer = setTimeout(() => child.kill('SIGKILL'), 3000); child.once('exit', () => { clearTimeout(timer); resolve() }); child.kill('SIGTERM') })
  })
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Production HTTP test did not start')), 10000)
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Production dispatcher exited before listening')) })
    child.stdout.on('data', () => { const found = /HTTP_TYPES_PORT=(\d+)/.exec(messages); if (found) { clearTimeout(timer); resolve(found[1]) } })
  })
  return { base: `http://127.0.0.1:${port}`, logs: () => messages }
}

for (const [name, start] of [['Vite', nativeVite], ['production dispatcher', production]]) {
  test(`${name} rejects structured login fields and accepts the corresponding string credentials`, { timeout: 30000 }, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hoooho-password-http-types-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const server = await start(t, directory)
    await check(server.base, server.logs)
  })
}
