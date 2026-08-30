import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const drawer = read('./SideDrawer.tsx')
const header = read('./MainAppHeader.tsx')
const settings = read('../../pages/Settings/index.tsx')
const guide = read('../../pages/Guide/index.tsx')
const help = read('../../pages/Help/index.tsx')
const feedback = read('../../pages/Feedback/index.tsx')
const about = read('../../pages/About/index.tsx')

test('every direct sidebar destination is represented by the shared top-level header contract', () => {
  for (const route of ['/health-events', '/health-profile', '/guide', '/settings', '/help', '/feedback', '/about']) {
    assert.match(drawer, new RegExp(`to: '${route.replaceAll('/', '\\/')}'`))
  }
  assert.match(header, /aria-label="打开菜单"/)
  assert.match(header, /<SideDrawer open=\{open\}/)
  assert.match(header, /compact \? 'sticky top-0 z-20 min-h-14' : 'min-h-16'/)
})

test('top-level utility pages use the shared compact sidebar header', () => {
  assert.match(settings, /topLevel \? <MainAppHeader compact title=\{title\} \/>/)
  assert.match(guide, /<MainAppHeader compact title="使用说明" \/>/)
  assert.match(help, /<MainAppHeader compact title="帮助中心" \/>/)
  assert.match(feedback, /<WebPageHeader title="反馈意见" onBack=\{goBack\} action=/)
  assert.match(about, /<MainAppHeader compact title="关于" \/>/)
})

test('nested settings, help and feedback pages retain back navigation', () => {
  assert.match(settings, /<WebPageHeader title=\{title\} fallback="\/settings" \/>/)
  assert.match(help, /nested \? <WebPageHeader title="帮助中心" onBack=\{home\} \/>/)
  assert.match(feedback, /<WebPageHeader title="我的反馈" fallback="\/settings"/)
  assert.match(feedback, /<WebPageHeader title="反馈详情" fallback="\/feedback\/mine"/)
  assert.match(feedback, />我的反馈<\/button>/)
})
