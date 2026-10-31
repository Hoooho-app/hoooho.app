import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { authApiPlugin } from '../../server/auth/vite-auth-plugin.mjs'
import { feedbackApiPlugin } from '../../server/help/vite-feedback-plugin.mjs'
import { opsApiPlugin } from '../../server/ops/vite-ops-plugin.mjs'
import { OpsWorkspaceService } from '../../server/ops/workspace-service.mjs'
import { DEFAULT_REMINDERS } from '../../server/ops/billing-health.mjs'
import { OpsService } from '../../server/ops/ops-service.mjs'
import { FeedbackService } from '../../server/help/feedback-service.mjs'
import { JsonStore } from '../../server/auth/storage/json-store.mjs'

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'ops-workspace-ui-'))
const shared = { dataDirectory, tokenSecret: 'ops-workspace-synthetic-secret', opsOwnerEmail: 'ops@example.test' }
const workspace = new OpsWorkspaceService({ ...shared, env: { RAILWAY_GIT_COMMIT_SHA: 'a'.repeat(40), RAILWAY_DEPLOYMENT_ID: 'synthetic-local-release', QINGGAN_UPSTREAM_URL: 'https://qinggan.example.test' }, fetchImpl: async url => String(url).includes('qinggan') ? new Response('<!doctype html><html>synthetic frontend</html>', { headers: { 'Content-Type': 'text/html' } }) : new Response('{"ok":true}') })
let billingFacts
const billing = new OpsService({ ...shared, getReminderRules: async () => (await workspace.settings()).reminders, collectors: { railway: async () => ({ dataUrl: `data:image/png;base64,${png.toString('base64')}`, facts: billingFacts, origin: 'page' }) } }), feedback = new FeedbackService(shared)
let seed
const png = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#e9f6f2' } }).png().toBuffer()
async function reset() {
  billingFacts = null
  await workspace.saveSettings({ reminders: DEFAULT_REMINDERS })
  await new JsonStore(path.join(dataDirectory, 'users.json'), {}).update(() => ({ users: [{ id: 'synthetic-ops-admin', email: 'ops@example.test', createdAt: new Date().toISOString() }] }))
  await new JsonStore(path.join(dataDirectory, 'ops/billing-sources.json'), {}).update(() => ({ sources: [], snapshots: [], inactiveSources: [] }))
  await new JsonStore(path.join(dataDirectory, 'feedback/records.json'), {}).update(() => ({ feedback: [], attachments: [], messages: [], statusHistory: [] }))
  await new JsonStore(path.join(dataDirectory, 'ops/overview-receipts.json'), {}).update(() => ({ receipts: [] }))
  const snapshot = { privacyConfirmed: true, name: 'synthetic.png', type: 'image/png', dataUrl: `data:image/png;base64,${png.toString('base64')}` }
  await billing.addManualSnapshot('railway', snapshot)
  const family = await billing.create({ name: '家庭费用（合成）', projectId: 'family', platformUrl: 'https://example.test/billing', method: 'manual-screenshot', frequency: 'manual' })
  await billing.addManualSnapshot(family.id, snapshot)
  const input = { description: '这是本地合成反馈，不是真实用户资料。', category: '出现错误', attachments: [], device: { type: 'desktop' } }
  const first = await feedback.create('synthetic-user', { ...input, description: '合成：情况单导出显示问题', idempotencyKey: 'first' })
  const old = await feedback.create('synthetic-user', { ...input, description: '合成：更早未查看反馈', idempotencyKey: 'older' }, new Date(Date.now() - 2 * 86_400_000))
  seed = { first: first.id, old: old.id, family: family.id }
}
await reset()
const server = await createServer({ configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 4217, strictPort: true }, plugins: [
  react(),
  { name: 'synthetic-no-service-worker', resolveId: id => id === 'virtual:pwa-register' ? '\0ops-pwa' : null, load: id => id === '\0ops-pwa' ? 'export function registerSW(){ return ()=>{} }' : null },
  { name: 'synthetic-fixtures-only', configureServer(server) { server.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith('/__test/')) return next()
    if (request.url === '/__test/reset' && request.method === 'POST') await reset()
    else if (request.url === '/__test/billing-warning' && request.method === 'POST') { billingFacts = { dueAt: new Date(Date.now() + 86400000).toISOString(), dueKind: 'renewal', balance: 0, currency: 'USD' }; await billing.refresh('railway') }
    else if (request.url === '/__test/supplement' && request.method === 'POST') await feedback.addUserMessage('synthetic-user', seed.first, { text: '合成：新补充信息', attachments: [] })
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(seed))
  }) } },
  authApiPlugin({ ...shared, emailProvider: { sendVerificationCode: async () => { throw new Error('Real email is forbidden in these tests') } } }),
  feedbackApiPlugin(shared), opsApiPlugin({ ...shared, service: billing, feedback, workspace })
] })
await server.listen()
console.log('Synthetic Operations UI available on 127.0.0.1:4217')
const close = async () => { await server.close(); await rm(dataDirectory, { recursive: true, force: true }); process.exit(0) }
process.on('SIGTERM', close); process.on('SIGINT', close)
