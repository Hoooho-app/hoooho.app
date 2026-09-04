import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import packageMetadata from './package.json'
import { authApiPlugin } from './server/auth/vite-auth-plugin.mjs'
import { membersApiPlugin } from './server/members/vite-members-plugin.mjs'
import { eventsApiPlugin } from './server/events/vite-events-plugin.mjs'
import { eventRecordsApiPlugin } from './server/events/vite-event-records-plugin.mjs'
import { quickRecordsApiPlugin } from './server/events/vite-quick-records-plugin.mjs'
import { eventAttachmentsApiPlugin } from './server/events/vite-event-attachments-plugin.mjs'
import { aiApiPlugin } from './server/ai/vite-ai-plugin.mjs'
import { opsApiPlugin } from './server/ops/vite-ops-plugin.mjs'
import { feedbackApiPlugin } from './server/help/vite-feedback-plugin.mjs'
import { onlineConsultationsApiPlugin } from './server/consultations/vite-online-consultations-plugin.mjs'
import { accountEntryStateApiPlugin } from './server/onboarding/vite-account-entry-state-plugin.mjs'
import { healthProfileFactsApiPlugin } from './server/health-profile/vite-health-profile-facts-plugin.mjs'
import { healthInformationCandidatesApiPlugin } from './server/health-information/vite-health-information-candidates-plugin.mjs'
import { accountApiPlugin } from './server/account/vite-account-plugin.mjs'

const buildEnvironment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const buildTimestamp = buildEnvironment.VITE_APP_UPDATED_AT || new Date().toISOString()

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_UPDATED_AT': JSON.stringify(buildTimestamp),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildEnvironment.VITE_APP_VERSION || packageMetadata.version)
  },
  server: {
    host: true
  },
  plugins: [
    authApiPlugin(),
    accountApiPlugin(),
    accountEntryStateApiPlugin(),
    membersApiPlugin(),
    eventsApiPlugin(),
    eventRecordsApiPlugin(),
    quickRecordsApiPlugin(),
    eventAttachmentsApiPlugin(),
    aiApiPlugin(),
    feedbackApiPlugin(),
    opsApiPlugin(),
    onlineConsultationsApiPlugin(),
    healthProfileFactsApiPlugin(),
    healthInformationCandidatesApiPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Hoooho 家庭健康',
        short_name: 'Hoooho',
        description: '家庭健康随记与就诊准备工具',
        theme_color: '#1B7A6E',
        background_color: '#F5F8F6',
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
