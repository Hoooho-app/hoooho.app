import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const router = read('../app/router.tsx')
const healthEvents = read('../pages/HealthEvents/index.tsx')
const drawer = read('../components/navigation/SideDrawer.tsx')
const header = read('../components/navigation/MainAppHeader.tsx')
const store = read('../store/useAppStore.ts')
const types = read('../types/index.ts')

test('通用消息中心页面、入口和持久化状态已删除', () => {
  assert.equal(existsSync(new URL('../pages/Messages/index.tsx', import.meta.url)), false)
  assert.doesNotMatch(healthEvents, /Bell|消息中心|\/messages/)
  assert.doesNotMatch(drawer, /label: '消息'|to: '\/messages'/)
  assert.doesNotMatch(header, /action|justify-self-end/)
  assert.equal(existsSync(new URL('../pages/HealthEventDetail/components/ActionSheet.tsx', import.meta.url)), false)
  assert.doesNotMatch(store, /NotificationPreferences|setNotification|setQuietHours/)
  assert.doesNotMatch(types, /interface NotificationPreferences/)
})

test('旧消息和通知地址统一安全重定向到儿童健康首页', () => {
  for (const path of ['/messages/*', '/message/*', '/notifications/*', '/notification/*']) {
    assert.match(router, new RegExp(`path: '${path.replaceAll('/', '\\/').replace('*', '\\*')}'[^}]+<Navigate to="\\/home" replace \\/>`))
  }
  assert.doesNotMatch(router, /import\('\.\.\/pages\/Messages'\)|MessageCenterPage/)
})
