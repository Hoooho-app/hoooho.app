import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { AuthService } from '../../server/auth/auth-service.mjs'
import { FamilyMemberService } from '../../server/members/family-member-service.mjs'
import { cleanupTestDataOnce } from '../../server/data/cleanup-test-data.mjs'

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'hoooho-analytics-e2e-')), secret = 'local-analytics-e2e-secret-only', email = 'analytics-owner@example.test'
await cleanupTestDataOnce(dataDirectory)
const auth = new AuthService({ dataDirectory, tokenSecret: secret })
const tester = await auth.register('埋点测试员', 'TestOnly123!', randomUUID())
await new FamilyMemberService({ dataDirectory }).create(tester.user.id, { name: '测试对象', relationship: 'child', gender: 'female', birthday: '2024-01-01' })
const owner = await auth.register('统计管理员', 'OwnerTestOnly123!', randomUUID())
const ownerUser = await auth.users.update(owner.user.id, { email })
await mkdir('.codex-tmp', { recursive: true })
await writeFile('.codex-tmp/analytics-fixture.json', JSON.stringify({ ownerToken: auth.tokens.create(ownerUser), nickname: '埋点测试员', password: 'TestOnly123!', userToken: tester.token, userId: tester.user.id, dataDirectory }))
const child = spawn(process.execPath, ['server/app.mjs'], { cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4268', DATA_DIRECTORY: dataDirectory, AUTH_TOKEN_SECRET: secret, OPS_OWNER_EMAIL: email, AI_PROVIDER: 'local' } })
const close = () => child.kill('SIGTERM')
process.on('SIGTERM', close); process.on('SIGINT', close)
child.on('exit', async code => { await rm(dataDirectory, { recursive: true, force: true }); process.exit(code || 0) })
