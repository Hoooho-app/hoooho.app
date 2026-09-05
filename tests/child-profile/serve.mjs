import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

process.chdir(path.resolve(import.meta.dirname, '../..'))
const dataDirectory = path.resolve('.codex-tmp/child-profile-e2e')
await rm(dataDirectory, { recursive: true, force: true })
await mkdir(dataDirectory, { recursive: true })
const now = new Date().toISOString()
const accountIds = ['child-profile-account', 'child-loading-iphone-se', 'family-swipe-delete', 'child-entry-iphone-se']
const projectNames = [
  'iphone-se',
  'mobile-375',
  'mobile-390',
  'mobile-430',
  'wechat-webview',
  'safari-iphone',
  'tablet-768',
  'desktop-1280'
]
accountIds.push(...projectNames.map((project) => `blank-child-${project}`))
await writeFile(path.join(dataDirectory, 'users.json'), JSON.stringify({ users: accountIds.map((id) => ({
  id, email: `${id}@hoooho.test`, createdAt: now, updatedAt: now
})) }, null, 2))
const members = projectNames.map((project, index) => ({
  id: `child-profile-${project}`,
  accountId: 'child-profile-account',
  name: index === 0 ? '安安' : `安安${index + 1}`,
  relationship: 'child',
  gender: 'female',
  birthday: '2023-05-12',
  avatar: 'clay:v1:toddler-girl:east-asian',
  caregivers: ['father', 'mother'],
  primaryRecorderRelationship: 'mother',
  otherRelative: '姨妈',
  otherCaregiver: null,
  isSelf: false,
  createdAt: now,
  updatedAt: now
}))
await writeFile(path.join(dataDirectory, 'family-members.json'), JSON.stringify({ members }, null, 2))
await writeFile(path.join(dataDirectory, '.cleanup-test-data-2026-08-09-v1'), JSON.stringify({
  appliedAt: now,
  source: 'child-profile-playwright-seed'
}))
process.env.PORT = '4194'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'development'
process.env.DATA_DIRECTORY = dataDirectory
process.env.AUTH_TOKEN_SECRET = 'child-profile-e2e-secret'
const shutdownMarker = path.join(dataDirectory, 'shutdown')
setInterval(() => void access(shutdownMarker).then(() => process.exit()).catch(() => undefined), 200)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => setTimeout(() => process.exit(), 750))
await import('../../server/app.mjs')
