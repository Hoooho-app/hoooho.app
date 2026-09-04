import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { maskEmail, maskPhone } from '../../services/account.ts'

const drawer = readFileSync(new URL('../../components/navigation/SideDrawer.tsx', import.meta.url), 'utf8')
const sheet = readFileSync(new URL('../../components/account/AccountSheet.tsx', import.meta.url), 'utf8')
const pages = readFileSync(new URL('../../pages/Account/index.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../styles/settings.css', import.meta.url), 'utf8')
const store = readFileSync(new URL('../../store/useAppStore.ts', import.meta.url), 'utf8')

test('sidebar account identity stays separate from the current child', () => {
  assert.match(drawer, /当前为体验模式/)
  assert.match(drawer, /已同步/)
  assert.doesNotMatch(drawer, /父亲|母亲/)
})

test('account sheet exposes only peer security, membership and logout actions', () => {
  for (const copy of ['账户与安全', '会员状态', '退出登录', '登录或注册', '继续体验']) assert.match(sheet, new RegExp(copy))
  assert.doesNotMatch(sheet, /数据同步|切换账户|登录设备/)
})

test('security grouping excludes membership, device and sync', () => {
  const security = pages.slice(pages.indexOf('export function AccountSecurityPage'), pages.indexOf('export function AccountNicknamePage'))
  for (const copy of ['头像', '昵称', '手机号', '邮箱', '第三方账户', '删除账户']) assert.match(security, new RegExp(copy))
  assert.doesNotMatch(security, /会员状态|设备管理|数据同步/)
})

test('membership uses one green badge without invented paid plans', () => {
  assert.match(sheet, /MembershipBadge/)
  assert.match(styles, /account-free-badge/)
  assert.doesNotMatch(pages, /\bPlus\b|\bPro\b|套餐价格|立即升级/)
})

test('contact details are masked for every account surface', () => {
  assert.equal(maskEmail('liulei@example.com'), 'liu•••@example.com')
  assert.equal(maskPhone('13812345678'), '+86 138••••5678')
})

test('editing, verification, provider failure and final deletion states are explicit', () => {
  for (const copy of ['从相册选择照片', '拍摄新照片', '取消本次选择', '头像缩放', '原手机号已验证', '验证码已发送', '暂未开放', '最后确认', '永久删除账户']) assert.match(pages, new RegExp(copy))
  assert.match(styles, /min-height: 44px/)
})

test('session tokens never persist in the local app store', () => {
  assert.match(store, /sessionStorage\.setItem\(key, value\)/)
  assert.match(store, /version: 5/)
  assert.match(store, /_removedAuthToken/)
  const partialize = store.slice(store.indexOf('partialize:'))
  assert.doesNotMatch(partialize, /\bauthToken\b|\bopsAuthToken\b/)
})
