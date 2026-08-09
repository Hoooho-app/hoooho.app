import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { authApiPlugin } from './server/auth/vite-auth-plugin.mjs'
import { membersApiPlugin } from './server/members/vite-members-plugin.mjs'
import { eventsApiPlugin } from './server/events/vite-events-plugin.mjs'
import { eventRecordsApiPlugin } from './server/events/vite-event-records-plugin.mjs'
import { eventAttachmentsApiPlugin } from './server/events/vite-event-attachments-plugin.mjs'
import { aiApiPlugin } from './server/ai/vite-ai-plugin.mjs'

export default defineConfig({
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
