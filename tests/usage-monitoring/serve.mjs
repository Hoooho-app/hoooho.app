import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { UsageLedger } from '../../server/usage/ledger.mjs'
const root = path.resolve('.codex-tmp/usage-monitoring-e2e')
await rm(root, { recursive: true, force: true }); await mkdir(root, { recursive: true })
// The historical Production cleanup removes orphan fixture attachments. This
// directory is disposable and intentionally contains no complete health event.
await writeFile(path.join(root, '.cleanup-test-data-2026-08-09-v1'), 'synthetic fixture only')
const now = new Date().toISOString()
await writeFile(path.join(root, 'users.json'), JSON.stringify({ users: [
  { id: 'usage-owner', email: 'usage-ops@example.test', nickname: '测试账户', createdAt: now },
  { id: 'usage-other', email: 'other@example.test', nickname: '其他账户', createdAt: now }
] }))
await writeFile(path.join(root, 'family-members.json'), JSON.stringify({ members: [{ id: 'usage-child', accountId: 'usage-owner', name: '合成宝宝', relationship: 'child', gender: 'undisclosed', birthday: '2024-01-01', avatar: null, createdAt: now, updatedAt: now }] }))
await mkdir(path.join(root, 'quick-record-photo-files'))
await writeFile(path.join(root, 'quick-record-photo-files', 'synthetic-original'), Buffer.alloc(2048))
await writeFile(path.join(root, 'event-attachments.json'), JSON.stringify({ attachments: [{ id: 'synthetic-attachment', accountId: 'usage-owner', storageKey: 'synthetic-original', name: 'synthetic.txt', createdAt: now }] }))
const secret = 'synthetic-local-resource-usage-secret'
const ledger = new UsageLedger({ dataDirectory: root, tokenSecret: secret })
ledger.receipt(ledger.begin('usage-owner', 'synthetic-model', 'test-only'), { inputTokens: 1200, outputTokens: 300, audioSeconds: 90 })
ledger.begin('usage-owner', 'synthetic-model', 'test-only') // Explicitly unknown receipt.
ledger.close()
Object.assign(process.env, { PORT: '4236', HOST: '127.0.0.1', NODE_ENV: 'development', DATA_DIRECTORY: root, AUTH_TOKEN_SECRET: secret, OPS_OWNER_EMAIL: 'usage-ops@example.test', AI_PROVIDER: 'local', ASR_PROVIDER: 'none', TTS_PROVIDER: 'none', OPS_CAPTURE_WORKER_URL: '', OPS_CAPTURE_WORKER_TOKEN: '', RESEND_API_KEY: '' })
await import('../../server/app.mjs')
