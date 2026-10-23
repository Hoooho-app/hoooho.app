import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-welcome-test-'))
process.env.PORT = '4208'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'development'
process.env.DATA_DIRECTORY = directory
process.env.AUTH_TOKEN_SECRET = 'welcome-browser-test-only-secret'
process.on('SIGINT', () => void rm(directory, { recursive: true, force: true }).finally(() => process.exit()))
await import('../../server/app.mjs')
