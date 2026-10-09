import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
process.chdir(path.resolve(import.meta.dirname, '../..'))
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-handoff-e2e-'))
await writeFile(path.join(dataDirectory, '.cleanup-test-data-2026-08-09-v1'), '{}')
const member = { id: 'handoff-child', accountId: 'handoff-test', name: '交接测试宝宝', relationship: 'child', gender: 'female', birthday: '2023-01-01', heightCm: 98, weightKg: 15 }
const files = {
  'users.json': { users: [{ id: 'handoff-test', nickname: '交接测试家长', currentMemberId: member.id, createdAt: new Date().toISOString() }] },
  'family-members.json': { members: [member] },
  'health-profile-sections.json': { sections: [{ accountId: member.accountId, memberId: member.id, sectionId: 'allergy', records: [{ id: 'allergy', name: '花生', currentStatus: 'confirmed', category: 'food' }] }] }
}
for (const [name, data] of Object.entries(files)) await writeFile(path.join(dataDirectory, name), JSON.stringify(data))
process.env.PORT = '4691'; process.env.HOST = '127.0.0.1'; process.env.NODE_ENV = 'development'
process.env.DATA_DIRECTORY = dataDirectory; process.env.AUTH_TOKEN_SECRET = 'handoff-e2e-local-only-secret'; process.env.AI_PROVIDER = 'local'
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void rm(dataDirectory, { recursive: true, force: true }).finally(() => process.exit()))
await import('../../server/app.mjs')
