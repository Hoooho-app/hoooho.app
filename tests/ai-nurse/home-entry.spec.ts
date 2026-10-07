import { test, expect, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: 'Bearer ' + token }
const utterance = '脸颊发红发痒，没有发热。我担心鸡蛋过敏，涂过保湿霜好像没变化。'

async function home(page: Page) {
  const response = await page.request.post('/api/members/empty-child/nurse-drafts', {
    headers, data: { scope: 'visit-test:empty-child:new:' },
  })
  expect(response.ok()).toBe(true)
  const draft = await response.json()
  expect((await page.request.patch('/api/members/empty-child/nurse-drafts/' + draft.id, {
    headers, data: { version: draft.version, discard: true },
  })).ok()).toBe(true)
  await page.addInitScript(token => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({
      state: { authUser: { id: 'visit-test' }, currentMemberId: 'empty-child', members: [], profile: null }, version: 5,
    }))
    ;(window as any).__homeMicrophoneRequests = 0
    navigator.mediaDevices.getUserMedia = async () => {
      ;(window as any).__homeMicrophoneRequests++
      throw new DOMException('合成权限拒绝', 'NotAllowedError')
    }
  }, token)
  await page.goto('/nurse-station')
  await expect(page.getByRole('region', { name: '和护士聊孩子的情况' })).toBeVisible()
}

test('新增入口位于顶部模块下方，旧入口保留；文字对话接回原核对保存', async ({ page }, testInfo) => {
  await home(page)
  const entry = page.getByRole('region', { name: '和护士聊孩子的情况' })
  await expect(entry.locator('svg,img,i')).toHaveCount(0)
  await expect(page.locator('.continuity-record-entry__action')).toHaveText('症状速记')
  await expect(page.locator('.nurse-home-entry')).toHaveCount(6)
  await expect(page.getByRole('button', { name: /^正在跟进/ })).toBeVisible()
  const positions = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    return { hero: rect('.nurse-station-hero').bottom, cardTop: rect('.nurse-home-dialogue').top,
      cardBottom: rect('.nurse-home-dialogue').bottom, previousTop: rect('.continuity-home').top,
      overflow: document.documentElement.scrollWidth > innerWidth }
  })
  expect(positions.cardTop).toBeGreaterThanOrEqual(positions.hero)
  expect(positions.previousTop).toBeGreaterThanOrEqual(positions.cardBottom)
  expect(positions.overflow).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true })
  await entry.getByRole('button', { name: '打字聊', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '智能症状记录', exact: true })
  await expect(panel.getByLabel('跟护士说')).toBeFocused()
  expect(await page.evaluate(() => (window as any).__homeMicrophoneRequests)).toBe(0)
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

test('返回首页后原对话保留，旧症状速记继续走原入口', async ({ page }) => {
  await home(page)
  await page.getByRole('region', { name: '和护士聊孩子的情况' }).getByRole('button', { name: '打字聊', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '智能症状记录', exact: true })
  await panel.getByLabel('跟护士说').fill(utterance)
  await panel.getByRole('button', { name: '发送', exact: true }).click()
  await expect(panel.getByText('有没有影响睡眠？', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '关闭智能症状记录', exact: true }).click()
  await page.getByRole('dialog', { name: '症状记录', exact: true }).getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await page.getByRole('region', { name: '和护士聊孩子的情况' }).getByRole('button', { name: '打字聊', exact: true }).click()
  await expect(panel.locator('.nurse-turn--user').getByText(utterance, { exact: true })).toHaveCount(1)
  await panel.getByRole('button', { name: '关闭智能症状记录', exact: true }).click()
  await page.getByRole('dialog', { name: '症状记录', exact: true }).getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await page.locator('.continuity-record-entry__action').click()
  await expect(page.getByRole('dialog', { name: '症状记录', exact: true })).toBeVisible()
  await expect(panel).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__homeMicrophoneRequests)).toBe(0)
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
