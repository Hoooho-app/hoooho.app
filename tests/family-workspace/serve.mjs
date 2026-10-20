// Isolated browser-test process only. Production never imports this fixture.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const directory = path.resolve('.codex-tmp/family-workspace-browser')
await mkdir(directory, { recursive: true })
process.env.DATA_DIRECTORY = path.join(directory, `data-${Date.now()}`)
process.env.PORT = '4197'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'production'
process.env.AUTH_TOKEN_SECRET = 'isolated-family-browser-test-secret'
process.env.OPS_OWNER_EMAIL = 'ray@example.test'
process.env.RESEND_API_KEY = 'isolated-test-provider'
process.env.AUTH_EMAIL_FROM = 'Hoooho <noreply@example.test>'
process.env.AI_PROVIDER = 'local-fact'
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, options) => {
  if (String(url) === 'https://api.resend.com/emails') {
    const payload = JSON.parse(options.body)
    const otp = /\b\d{6}\b/.exec(payload.text)?.[0]
    await writeFile(path.join(directory, 'test-email.json'), JSON.stringify({ email: payload.to[0], otp }), { mode: 0o600 })
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return originalFetch(url, options)
}
await import('../../server/app.mjs')
