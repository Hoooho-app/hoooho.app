import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

process.chdir(path.resolve(import.meta.dirname, '../..'))
const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-allergy-browser-'))
process.env.DATA_DIRECTORY = directory
process.env.PORT = '4209'
process.env.NODE_ENV = 'development'
process.env.AUTH_TOKEN_SECRET = 'synthetic-allergy-browser-secret'
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await rm(directory, { recursive: true, force: true }); process.exit() })
await import('../../server/app.mjs')
