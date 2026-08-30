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

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  root: projectRoot,
  server: { host: '127.0.0.1', watch: { ignored: ['**/tests/health-timeline-multimodal/.artifacts/**'] } },
  plugins: [
    authApiPlugin({
      codeGenerator: () => '123456',
      emailProvider: { sendVerificationCode: async () => undefined },
      logger: () => undefined
    }),
    accountEntryStateApiPlugin(),
    membersApiPlugin(),
    eventsApiPlugin(),
    eventRecordsApiPlugin(),
    eventAttachmentsApiPlugin(),
    aiApiPlugin(),
    react(),
    VitePWA({ registerType: 'autoUpdate', manifest: false })
  ]
})
