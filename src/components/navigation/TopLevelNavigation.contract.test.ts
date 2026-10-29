import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const drawer = read('./SideDrawer.tsx')
const header = read('./MainAppHeader.tsx')
const bottom = read('./MainBottomNavigation.tsx')
const settings = read('../../pages/Settings/index.tsx')
const guide = read('../../pages/Guide/index.tsx')
const help = read('../../pages/Help/index.tsx')
const feedback = read('../../pages/Feedback/index.tsx')
const about = read('../../pages/About/index.tsx')
const welcome = read('../../pages/NurseStation/FrontDeskWelcome.tsx')

test('primary destinations stay in bottom navigation and help moves to the homepage guide', () => {
  for (const route of ['/nurse-station', '/health-events', '/health-profile']) assert.match(bottom, new RegExp(`to: '${route.replaceAll('/', '\\/')}'`))
  for (const route of ['/feedback', '/about']) assert.match(drawer, new RegExp(`to: '${route.replaceAll('/', '\\/')}'`))
  assert.doesNotMatch(drawer, /to: '\/help'/)
  assert.match(welcome, /navigate\('\/help'\)/)
  assert.match(header, /aria-label="打开菜单"/)
  assert.match(header, /<SideDrawer open=\{open\}/)
  assert.match(header, /compact \? 'sticky top-0 z-20 min-h-14' : 'min-h-16'/)
})

test('four primary actions use approved copy without a duplicated sidebar menu or a fifth personal tab', () => {
  for (const label of ['症状记录', '健康日历', '孩子档案', '一键整理']) assert.match(bottom, new RegExp(label))
  assert.doesNotMatch(drawer, /label: '服务前台'|label: '健康日历'|label: '孩子档案'|label: '一键整理'/)
  assert.doesNotMatch(bottom, />我的</)
  assert.doesNotMatch(drawer, /label: '健康随记'|label: '健康月历'/)
  assert.doesNotMatch(drawer, /label: '设置'|to: '\/settings'/)
  assert.match(drawer, /label: '反馈'[^\n]*to: '\/feedback'[\s\S]*label: '关于'[^\n]*to: '\/about'/)
})

test('merged help entry removes the former guide entry', () => {
  assert.doesNotMatch(drawer, /label: '说明'|to: '\/guide'/)
})

test('sidebar identities use display privacy and a user-centered member relationship', () => {
  assert.match(drawer, /maskIdentityName\(member\.name\)/)
  assert.match(drawer, /recordSubjectRelationship\(member\)/)
  assert.match(drawer, /aria-label="我的账户"/)
  assert.doesNotMatch(drawer, /accountRelationship|产品中心|已同步/)
})

test('top-level utility pages use the shared compact sidebar header', () => {
  assert.match(settings, /topLevel \? <MainAppHeader compact title=\{title\} \/>/)
  assert.match(guide, /Navigate to="\/help\?tab=manual" replace/)
  assert.match(help, /<WebPageHeader title="帮助中心" fallback="\/nurse-station"\s*\/>/)
  assert.match(feedback, /<MainAppHeader action=\{<button className="feedback-header-action"/)
  assert.match(feedback, /compact title="反馈意见" \/>/)
  assert.match(about, /<MainAppHeader compact title="关于" \/>/)
})

test('nested settings, help and feedback pages retain back navigation', () => {
  assert.match(settings, /<WebPageHeader title=\{title\} fallback="\/settings" \/>/)
  assert.match(help, /nested\s*\?\s*<WebPageHeader title="帮助中心" onBack=\{back\}\s*\/>/)
  assert.match(feedback, /<WebPageHeader title="我的反馈" fallback="\/feedback"/)
  assert.match(feedback, /<WebPageHeader title="反馈详情" fallback="\/feedback\/mine"/)
  assert.match(feedback, />我的反馈<\/button>/)
})
