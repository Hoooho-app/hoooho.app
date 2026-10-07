import { test, expect, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: 'Bearer ' + token }
const utterance = '脸颊发红发痒，没有发热。我担心鸡蛋过敏，涂过保湿霜好像没变化。'

async function home(page: Page, memberId = 'empty-child') {
  const response = await page.request.post('/api/members/empty-child/nurse-drafts', {
    headers, data: { scope: 'visit-test:empty-child:new:' },
  })
  expect(response.ok()).toBe(true)
  const draft = await response.json()
  expect((await page.request.patch('/api/members/empty-child/nurse-drafts/' + draft.id, {
    headers, data: { version: draft.version, discard: true },
  })).ok()).toBe(true)
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({
      state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5,
    }))
    ;(window as any).__homeMicrophoneRequests = 0
    navigator.mediaDevices.getUserMedia = async () => {
      ;(window as any).__homeMicrophoneRequests++
      throw new DOMException('合成权限拒绝', 'NotAllowedError')
    }
  }, { token, memberId })
  await page.goto('/nurse-station')
  await expect(page.getByRole('region', { name: '和护士聊孩子的情况' })).toBeVisible()
}

async function talkByText(page: Page) {
  await page.getByRole('region', { name: '和护士聊孩子的情况' }).getByRole('button', { name: '和护士说', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '智能症状记录', exact: true })
  await expect(panel.getByRole('alert')).toContainText('合成权限拒绝')
  await panel.getByRole('button', { name: '改用文字', exact: true }).click()
  return panel
}

test('紧凑资料、护士动画和整合跟进入口；文字补充接回原核对保存', async ({ page }, testInfo) => {
  await home(page)
  const entry = page.getByRole('region', { name: '和护士聊孩子的情况' })
  await expect(entry.locator('button svg,button img,i')).toHaveCount(0)
  await expect(page.locator('.nurse-station-hero video')).toHaveCount(0)
  await expect(entry.locator('video')).toHaveCount(1)
  await expect(page.locator('.continuity-home')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打字聊', exact: true })).toHaveCount(0)
  await expect(page.locator('.nurse-home-entry')).toHaveCount(6)
  await expect(page.getByRole('button', { name: /^正在跟进/ })).toBeVisible()
  const positions = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    return { hero: rect('.nurse-station-hero').bottom, heroHeight: rect('.nurse-station-hero').height,
      avatarWidth: rect('.nurse-station-identity > :first-child').width, avatarHeight: rect('.nurse-station-identity > :first-child').height,
      cardTop: rect('.nurse-home-dialogue').top,
      cardBottom: rect('.nurse-home-dialogue').bottom, entriesTop: rect('.nurse-home-entries').top,
      overflow: document.documentElement.scrollWidth > innerWidth }
  })
  expect(positions.cardTop).toBeGreaterThanOrEqual(positions.hero)
  expect(positions.entriesTop).toBeGreaterThanOrEqual(positions.cardBottom)
  expect(positions.heroHeight).toBeLessThan(150)
  expect(positions.avatarWidth).toBe(44)
  expect(positions.avatarHeight).toBe(44)
  expect(positions.overflow).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true })
  const panel = await talkByText(page)
  await expect(panel.getByLabel('跟护士说')).toBeFocused()
  expect(await page.evaluate(() => (window as any).__homeMicrophoneRequests)).toBe(1)
  await panel.getByLabel('跟护士说').fill(utterance)
  await panel.getByRole('button', { name: '发送', exact: true }).click()
  await expect(panel.getByText('有没有影响睡眠？', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('conversation.png'), fullPage: true })
  await panel.getByRole('button', { name: '先整理', exact: true }).click()
  await expect(panel).toHaveCount(0)
  const form = page.getByRole('dialog', { name: '症状记录', exact: true })
  await expect(form.getByLabel('哪里不舒服')).toHaveValue('脸颊发红发痒，没有发热')
  await form.getByRole('button', { name: '确认并保存', exact: true }).click()
  await expect(page).toHaveURL(/\/health-events\/[^/]+$/)
  const eventId = page.url().split('/').at(-1)
  const records = await (await page.request.get('/api/events/' + eventId + '/records', { headers })).json()
  expect(records).toHaveLength(1)
  expect(records[0].journal.aiNurse.turns.filter((turn: any) => turn.role === 'user')).toHaveLength(1)
  expect(records[0].journal.aiNurse.turns.find((turn: any) => turn.role === 'user').text).toBe(utterance)
})

test('语音入口仅启动一次；拒绝后可打字，关闭、重开和刷新均不自动开麦', async ({ page }) => {
  await home(page)
  await page.getByRole('region', { name: '和护士聊孩子的情况' }).getByRole('button', { name: '和护士说', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '智能症状记录', exact: true })
  await expect(panel.getByRole('alert')).toContainText('合成权限拒绝')
  expect(await page.evaluate(() => (window as any).__homeMicrophoneRequests)).toBe(1)
  await panel.getByRole('button', { name: '改用文字', exact: true }).click()
  await expect(panel.getByLabel('跟护士说')).toBeFocused()
  await panel.getByRole('button', { name: '关闭智能症状记录', exact: true }).click()
  await expect(panel).toHaveCount(0)
  const form = page.getByRole('dialog', { name: '症状记录', exact: true })
  await form.getByRole('button', { name: 'AI 护士 · 继续', exact: true }).click()
  await expect(panel.getByLabel('跟护士说')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__homeMicrophoneRequests)).toBe(1)
  await page.reload()
  await expect(panel).toHaveCount(0)
  await expect(form).toBeVisible()
  expect(await page.evaluate(() => (window as any).__homeMicrophoneRequests)).toBe(0)
})

test('返回首页后原对话保留，直接症状记录仍打开原表单', async ({ page }) => {
  await home(page)
  const panel = await talkByText(page)
  await panel.getByLabel('跟护士说').fill(utterance)
  await panel.getByRole('button', { name: '发送', exact: true }).click()
  await expect(panel.getByText('有没有影响睡眠？', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '关闭智能症状记录', exact: true }).click()
  await page.getByRole('dialog', { name: '症状记录', exact: true }).getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await page.getByRole('region', { name: '和护士聊孩子的情况' }).getByRole('button', { name: '和护士说', exact: true }).click()
  await expect(panel.locator('.nurse-turn--user').getByText(utterance, { exact: true })).toHaveCount(1)
  await panel.getByRole('button', { name: '关闭智能症状记录', exact: true }).click()
  await page.getByRole('dialog', { name: '症状记录', exact: true }).getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await page.goto('/smart-record')
  await expect(page.getByRole('dialog', { name: '症状记录', exact: true })).toBeVisible()
  await expect(panel).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__homeMicrophoneRequests)).toBe(0)
})

test('整合后的跟进数量、跟进中/已康复、成长数据和血型编辑仍可用', async ({ page }, testInfo) => {
  await home(page, 'child-a')
  const cases = await (await page.request.get('/api/members/child-a/cases', { headers })).json()
  const followup = page.getByRole('button', { name: `正在跟进 · ${cases.active.length}`, exact: true })
  await expect(followup).toBeVisible()
  await followup.click()
  await expect(page).toHaveURL(/\/cases$/)
  await expect(page.getByRole('tab', { name: /^跟进中/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: /^已康复/ }).click()
  await expect(page.getByRole('tab', { name: /^已康复/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: /^跟进中/ }).click()
  await expect(page.getByRole('tab', { name: /^跟进中/ })).toHaveAttribute('aria-selected', 'true')
  await page.goto('/nurse-station')
  await expect(page.getByRole('region', { name: '和护士聊孩子的情况' })).toBeVisible()
  await page.getByRole('button', { name: /^身高，/ }).click()
  await expect(page).toHaveURL(/\/health-profile\/basic$/)
  await page.goto('/nurse-station')
  await page.getByRole('button', { name: /^血型，/ }).click()
  await expect(page.getByRole('heading', { name: '编辑血型', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.nurse-home-dialogue video')).toHaveAttribute('data-active', 'false')
  await expect(page.locator('.nurse-home-dialogue video')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: testInfo.outputPath('compact-home.png'), fullPage: true })
})

test('不接收其他孩子或账号遗留的语音入口意图', async ({ page }) => {
  await home(page)
  await page.addInitScript(() => {
    if (location.pathname !== '/smart-record') return
    history.replaceState({ ...history.state, usr: { homeNurseEntry: {
      mode: 'voice', memberId: 'not-current-child', accountId: 'not-current-account',
    } } }, '')
  })
  await page.goto('/smart-record')
  await expect(page.getByRole('dialog', { name: '症状记录', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '智能症状记录', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__homeMicrophoneRequests)).toBe(0)
})

test('跟进同步失败保留有效数量且可打开列表；切换孩子不沿用旧数量', async ({ page }) => {
  await home(page, 'child-a')
  const followup = page.getByRole('button', { name: /^正在跟进/ })
  await expect(followup).toHaveAttribute('aria-label', '正在跟进 · 1')
  await followup.click()
  await expect(page.getByRole('tab', { name: /^跟进中/ })).toBeVisible()
  await page.route('**/api/members/child-a/cases?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic sync failure' }) }))
  await page.goBack()
  await expect(page.locator('#home-follow-up-sync')).toContainText('跟进数量同步失败')
  await expect(page.locator('.nurse-home-dialogue__count')).toHaveText('1!')
  await expect(followup).toBeEnabled()
  await followup.click()
  await expect(page).toHaveURL(/\/cases$/)
  await page.goBack()
  await page.getByRole('button', { name: /^选择孩子，当前/ }).click()
  await page.getByRole('button', { name: '切换到空资料（虚构）', exact: true }).click()
  await expect(page.getByRole('button', { name: '选择孩子，当前空资料（虚构）', exact: true })).toBeVisible()
  await expect(followup).toHaveAttribute('aria-label', '正在跟进 · 0')
  await expect(page.locator('.nurse-home-dialogue__count')).toHaveText('0')
  expect(await page.evaluate(() => (window as any).__homeMicrophoneRequests)).toBe(0)
})
