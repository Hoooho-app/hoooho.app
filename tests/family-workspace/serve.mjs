// Isolated browser-test process only. Production never imports this fixture.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const port = process.env.FAMILY_TEST_PORT || '4197'
const directory = path.resolve(`.codex-tmp/family-workspace-browser${port === '4197' ? '' : `-${port}`}`)
await mkdir(directory, { recursive: true })
process.env.DATA_DIRECTORY = path.join(directory, `data-${Date.now()}`)
process.env.PORT = port
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'production'
process.env.AUTH_TOKEN_SECRET = 'isolated-family-browser-test-secret'
process.env.OPS_OWNER_EMAIL = 'ray@example.test'
process.env.RESEND_API_KEY = 'isolated-test-provider'
process.env.AUTH_EMAIL_FROM = 'Hoooho <noreply@example.test>'
process.env.AI_PROVIDER = 'local-fact'
const originalFetch = globalThis.fetch
// Only this isolated browser-test server supplies synthetic OCR; production never imports it.
const { BusinessModel } = await import('../../server/ai/business/model.mjs')
const originalStructured = BusinessModel.prototype.structured
let assetRecognitionCalls = 0
BusinessModel.prototype.structured = async function (request) {
  if (!request.instructions.startsWith('逐行转录资产附件中的可读文字')) return originalStructured.call(this, request)
  assetRecognitionCalls++
  await writeFile(path.join(directory, 'asset-parse-calls.json'), JSON.stringify({ calls: assetRecognitionCalls }))
  return { value: { text: 'BROWSER TEST CARD\n有效期 10/28\n测试资料，不是真实银行卡', status: 'readable' } }
}
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
