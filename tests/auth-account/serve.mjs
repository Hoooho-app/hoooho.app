import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const shutdownMarker = path.resolve('.codex-tmp/auth-account-shutdown')
await mkdir(path.dirname(shutdownMarker), { recursive: true })
await rm(shutdownMarker, { force: true })
setInterval(() => void access(shutdownMarker).then(() => process.exit()).catch(() => undefined), 200)
process.env.PORT = '4196'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'development'
process.env.DATA_DIRECTORY = await mkdtemp(path.join(os.tmpdir(), 'hoooho-auth-browser-'))
process.env.AUTH_TOKEN_SECRET = 'auth-browser-test-only-secret'
await import('../../server/app.mjs')
