import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { authApiPlugin } from './server/auth/vite-auth-plugin.mjs'
import { membersApiPlugin } from './server/members/vite-members-plugin.mjs'
import { eventsApiPlugin } from './server/events/vite-events-plugin.mjs'
import { eventRecordsApiPlugin } from './server/events/vite-event-records-plugin.mjs'
import { eventAttachmentsApiPlugin } from './server/events/vite-event-attachments-plugin.mjs'
import { aiApiPlugin } from './server/ai/vite-ai-plugin.mjs'
import { opsApiPlugin } from './server/ops/vite-ops-plugin.mjs'
import { feedbackApiPlugin } from './server/help/vite-feedback-plugin.mjs'

const buildEnvironment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildEnvironment.VITE_APP_VERSION || buildEnvironment.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) || 'web')
  },
  server: {
    host: true
  },
  plugins: [
    authApiPlugin(),
    membersApiPlugin(),
    eventsApiPlugin(),
    eventRecordsApiPlugin(),
    eventAttachmentsApiPlugin(),
    aiApiPlugin(),
    feedbackApiPlugin(),
    opsApiPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Hoooho 家庭健康',
        short_name: 'Hoooho',
        description: '家庭健康事件管理与就诊准备工具',
        theme_color: '#4db6ac',
        background_color: '#f4faf8',
        display: 'standalone',
        start_url: '/health-events',
        lang: 'zh-CN',
        icons: [
          {
            src: '/icons/app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
