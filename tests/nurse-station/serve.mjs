import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

process.env.PORT = '4197'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'development'
process.env.DATA_DIRECTORY = await mkdtemp(path.join(os.tmpdir(), 'hoooho-nurse-station-browser-'))
process.env.AUTH_TOKEN_SECRET = 'nurse-station-browser-test-only-secret'
await import('../../server/app.mjs')
