// Isolated browser acceptance: synthetic accounts and a disposable JSON volume.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from '@playwright/test'
import { FamilySharingService } from './family-sharing-service.mjs'
import { familySharingApiPlugin } from './api.mjs'
import { TokenService } from '../auth/token-service.mjs'

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.chdir(app)
const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-family-browser-'))
const output = process.env.FAMILY_ACCEPTANCE_OUTPUT ?? path.join(os.tmpdir(), 'hoooho-family-mobile-evidence')
await mkdir(output, { recursive: true })
const secret = 'isolated-family-acceptance-only', tokens = new TokenService(secret, 3600_000)
const service = new FamilySharingService({ dataDirectory: directory, entitlement: async () => ({ active: true, mode: 'internal_test' }) })
const a = await service.users.findOrCreateByEmail('family-a@example.test'), b = await service.users.findOrCreateByEmail('family-b@example.test')
await service.users.update(a.id, { nickname: '妈妈' }); await service.users.update(b.id, { nickname: '爸爸' })
const child = await service.members.create({ accountId: a.id, name: '小禾', relationship: 'child', birthday: '2024-01-01', gender: 'female' })
async function addRecord(accountId, memberId, content) {
  const instant = new Date(Date.now() - 3600_000).toISOString()
  const event = await service.events.create({ accountId, memberId, title: '早奶', category: 'other', status: 'observing', startTime: instant })
  return service.records.create({ accountId, eventId: event.id, type: 'diet', content, occurredAt: instant })
}
await addRecord(a.id, child.id, '早奶150mL，已核对')
const actorFrom = request => tokens.verify(/^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '')?.sub
const html = actor => `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import '/src/styles/index.css';
import {useAppStore} from '/src/store/useAppStore.ts';
import {FamilySharingPage} from '/src/features/family-sharing/FamilySharingPage.tsx';
useAppStore.getState().setAuthSession(${JSON.stringify({ token: tokens.create(actor), user: { id: actor.id, nickname: actor.id === a.id ? '妈妈' : '爸爸', createdAt: actor.createdAt } })});
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(FamilySharingPage)));
</script></body></html>`
let vite, browser
try {
  vite = await createServer({ root: app, cacheDir: path.join(directory, 'vite-cache'), configFile: false, plugins: [react(), {
    name: 'family-isolated-acceptance-entry', configureServer(server) { server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname === '/__family-test.html') { response.setHeader('Content-Type', 'text/html'); response.end(await server.transformIndexHtml(request.url, html(url.searchParams.get('actor') === 'b' ? b : a))); return }
      if (url.pathname === '/api/members') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(await service.members.findByAccountId(actorFrom(request)))); return }
      next()
    }) }
  }, familySharingApiPlugin({ dataDirectory: directory, service, tokenSecret: secret, readAccountId: actorFrom })], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react-dom/client', 'react-router-dom', 'zustand', 'lucide-react'] } })
  await vite.listen()
  const port = vite.httpServer.address().port, base = `http://127.0.0.1:${port}`
  browser = await chromium.launch({ headless: true })
  const errors = []
  const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } }), pageA = await contextA.newPage()
  pageA.on('pageerror', e => errors.push(e.message))
  await pageA.goto(`${base}/__family-test.html`)
  await pageA.getByLabel('小禾', { exact: true }).check()
  await pageA.getByRole('button', { name: '创建家庭工作区', exact: true }).click()
  await pageA.getByRole('dialog').getByRole('button', { name: '确认创建' }).click()
  await pageA.getByRole('textbox', { name: '对方 Hoooho ID' }).fill(b.hooohoId)
  await pageA.getByRole('button', { name: '发出邀请', exact: true }).click()
  await pageA.getByRole('dialog').getByRole('button', { name: '发出邀请', exact: true }).click()
  await pageA.getByRole('button', { name: '预览可共享记录' }).click()
  await pageA.getByRole('button', { name: '确认本批共享' }).click()
  await pageA.getByRole('dialog').getByRole('button', { name: '确认共享', exact: true }).click()
  await pageA.getByText('本批已共享 1 条记录', { exact: true }).waitFor()
  await pageA.screenshot({ path: path.join(output, 'family-published-390.png'), fullPage: true })
  const contextB = await browser.newContext({ viewport: { width: 375, height: 667 } }), pageB = await contextB.newPage()
  pageB.on('pageerror', e => errors.push(e.message))
  await pageB.goto(`${base}/__family-test.html?actor=b`)
  await pageB.getByRole('button', { name: '查看并接受' }).click()
  await pageB.getByRole('dialog').getByRole('button', { name: '确认接受' }).click()
  await pageB.getByRole('button', { name: '核对并关联' }).click()
  await pageB.getByRole('dialog').getByRole('button', { name: '确认关联' }).click()
  await pageB.getByText('已关联个人档案，可继续使用现有记录表单', { exact: true }).waitFor()
  const myChild = (await service.members.findByAccountId(b.id)).find(m => m.relationship === 'child')
  await addRecord(b.id, myChild.id, '爸爸核对的午奶120mL')
  await pageB.getByRole('button', { name: '预览可共享记录' }).click()
  await pageB.getByRole('button', { name: '确认本批共享' }).click()
  await pageB.getByRole('dialog').getByRole('button', { name: '确认共享', exact: true }).click()
  await pageB.getByText('本批已共享 1 条记录', { exact: true }).waitFor()
  await pageB.screenshot({ path: path.join(output, 'family-caregiver-375.png'), fullPage: true })
  assert.equal(await pageB.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  const spaceId = new URL(pageA.url()).searchParams.get('space')
  await pageA.getByRole('button', { name: '刷新', exact: true }).click()
  await pageA.getByText('爸爸核对的午奶120mL', { exact: true }).waitFor()
  await pageA.getByRole('button', { name: '停止授权', exact: true }).click()
  await pageA.getByRole('dialog').getByRole('button', { name: '确认停止' }).click()
  await pageB.getByRole('button', { name: '刷新', exact: true }).click()
  await pageB.getByText('家庭空间不存在或共享授权已撤销', { exact: true }).waitFor()
  assert.equal(await pageB.getByText('爸爸核对的午奶120mL', { exact: true }).count(), 0)
  assert.equal((await service.records.findByAccountId(b.id)).length, 1)
  assert.equal((await service.getSpace(a.id, spaceId)).entries.some(e => e.sourceAccountId === b.id), false)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, mobileViewports: ['390x844', '375x667'], flows: ['create', 'invite', 'publish', 'accept', 'personal-copy-link', 'publish-other-parent', 'revoke-immediately', 'personal-record-retained'], screenshots: output }))
} finally {
  await browser?.close(); await vite?.close(); await rm(directory, { recursive: true, force: true })
}
