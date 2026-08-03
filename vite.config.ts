import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    host: true
  },
  plugins: [
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
