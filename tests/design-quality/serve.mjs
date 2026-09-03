import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

process.chdir(path.resolve(import.meta.dirname, '../..'))
const dataDirectory = path.resolve('.codex-tmp/design-quality-e2e')
await rm(dataDirectory, { recursive: true, force: true })
await mkdir(dataDirectory, { recursive: true })
const now = new Date().toISOString()
await writeFile(path.join(dataDirectory, 'family-members.json'), JSON.stringify({ members: [{
  id: 'design-quality-member', accountId: 'design-quality-account', name: '安安', relationship: 'child',
  gender: 'female', birthday: '2021-06-01', avatar: null, heightCm: 108, weightKg: 18,
  bloodType: 'A', waistCircumferenceCm: null, bodyFatPercentage: null, headCircumferenceCm: null,
  rhBloodType: null, isSelf: false, createdAt: now, updatedAt: now
}] }, null, 2))
await writeFile(path.join(dataDirectory, '.cleanup-test-data-2026-08-09-v1'), JSON.stringify({ appliedAt: now }))
process.env.PORT = '4191'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'development'
process.env.DATA_DIRECTORY = dataDirectory
process.env.AUTH_TOKEN_SECRET = 'design-quality-e2e-secret'
const shutdownMarker = path.join(dataDirectory, 'shutdown')
setInterval(() => void access(shutdownMarker).then(() => process.exit()).catch(() => undefined), 200)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => setTimeout(() => process.exit(), 750))
await import('../../server/app.mjs')
