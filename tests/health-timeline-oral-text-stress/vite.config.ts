import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authApiPlugin } from '../../server/auth/vite-auth-plugin.mjs'
import { membersApiPlugin } from '../../server/members/vite-members-plugin.mjs'
import { eventsApiPlugin } from '../../server/events/vite-events-plugin.mjs'
import { eventRecordsApiPlugin } from '../../server/events/vite-event-records-plugin.mjs'
import { eventAttachmentsApiPlugin } from '../../server/events/vite-event-attachments-plugin.mjs'
import { aiApiPlugin } from '../../server/ai/vite-ai-plugin.mjs'
import { accountEntryStateApiPlugin } from '../../server/onboarding/vite-account-entry-state-plugin.mjs'
import { authConfig } from '../../server/auth/config.mjs'
import { TokenService } from '../../server/auth/token-service.mjs'
import { HealthRecordOrganizationService } from '../../server/ai/health-record-organization-service.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dataDirectory = path.join(projectRoot, 'tests/health-timeline-oral-text-stress/.artifacts/data')
const organizationService = new HealthRecordOrganizationService({ dataDirectory, structuredMode: 'enabled' })
const tokenService = new TokenService(authConfig.tokenSecret, authConfig.tokenTtlMs)

const readJson = (request: import('node:http').IncomingMessage) => new Promise<Record<string, unknown>>((resolve, reject) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}) }
    catch (error) { reject(error) }
  })
  request.on('error', reject)
})

const confirmApiPlugin = {
  name: 'oral-text-confirm-api',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      const match = /^\/api\/events\/([^/]+)\/organizations\/confirm$/.exec(pathname)
      if (!match) return next()
      try {
        const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')
        const payload = bearer ? tokenService.verify(bearer[1]) : null
        if (!payload) throw Object.assign(new Error('登录状态无效或已过期'), { status: 401, code: 'UNAUTHORIZED' })
        if (request.method !== 'POST') throw Object.assign(new Error('请求方法不支持'), { status: 405, code: 'METHOD_NOT_ALLOWED' })
        const result = await organizationService.confirm(payload.sub, decodeURIComponent(match[1]), await readJson(request))
        response.statusCode = 201
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify(result))
      } catch (error) {
        const reason = error as { status?: number; code?: string; message?: string }
        const status = Number.isInteger(reason.status) ? reason.status as number : 500
        response.statusCode = status
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(JSON.stringify({ error: { code: reason.code ?? 'INTERNAL_ERROR', message: status >= 500 ? '服务器暂时不可用' : reason.message } }))
      }
    })
  }
}

export default defineConfig({
  root: projectRoot,
  server: { host: '127.0.0.1', port: 4190, watch: { ignored: ['**/tests/health-timeline-oral-text-stress/.artifacts/**'] } },
  plugins: [
    confirmApiPlugin,
    authApiPlugin({ dataDirectory, codeGenerator: () => '123456', emailProvider: { sendVerificationCode: async () => undefined }, logger: () => undefined }),
    accountEntryStateApiPlugin({ dataDirectory }),
    membersApiPlugin({ dataDirectory }),
    eventsApiPlugin({ dataDirectory }),
    eventRecordsApiPlugin({ dataDirectory }),
    eventAttachmentsApiPlugin({ dataDirectory }),
    aiApiPlugin({ dataDirectory, service: organizationService, tokens: tokenService }),
    react(),
    VitePWA({ registerType: 'autoUpdate', manifest: false })
  ]
})
