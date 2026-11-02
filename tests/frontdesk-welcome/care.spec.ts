import { expect, test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'


test('fixed header entrance opens the existing daily claim; failure, retry and refresh never duplicate rewards', async ({ page, request }) => {
  const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
  const headers = { Authorization: `Bearer ${token}` }
  const member = await request.post('/api/members', { headers, data: { name: '领取验收', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  const memberId = (await member.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  const before = await (await request.get('/api/care-journey', { headers })).json()
  let claims = 0
  page.on('request', request => { if (request.url().endsWith('/api/care-journey/check-in') && request.method() === 'POST') claims++ })
  await page.goto('/nurse-station')
  await expect(page.locator('.front-desk-workflow')).toBeVisible()
  await page.getByRole('button', { name: '呵护之旅', exact: true }).click()
  await expect(page).toHaveURL(/\/care-journey$/)
  expect(claims).toBe(0)
  if (!before.today.checkedIn) {
    await page.route('**/api/care-journey/check-in', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEST_UNAVAILABLE', message: '模拟网络失败' } }) }), { times: 1 })
    await page.getByRole('button', { name: '领取树芽', exact: true }).click()
    await expect(page.getByText('模拟网络失败', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '重试领取', exact: true }).click()
  }
  await expect(page.getByRole('button', { name: '今日已领取', exact: true })).toBeDisabled()
  const after = await (await request.get('/api/care-journey', { headers })).json()
  expect(after.balance).toBe(before.balance + (before.today.checkedIn ? 0 : 1))
  expect(after.careDays).toBe(before.careDays + (before.today.checkedIn ? 0 : 1))
  await page.reload()
  await expect(page.getByRole('button', { name: '今日已领取', exact: true })).toBeDisabled()
  const duplicate = await request.post('/api/care-journey/check-in', { headers, data: {} })
  expect((await duplicate.json()).balance).toBe(after.balance)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await expect(page.getByRole('button', { name: '呵护之旅', exact: true })).toBeVisible()
})

test('care journey contains only claim, growth and achievements; retired routes and APIs cannot reward or charge', async ({ page, request }, info) => {
  const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
  const headers = { Authorization: `Bearer ${token}` }
  const member = await request.post('/api/members', { headers, data: { name: '签到验收', relationship: 'child', birthday: '2024-01-01', gender: 'female' } })
  const memberId = (await member.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/care-journey')
  await expect(page.getByRole('heading', { name: '呵护之旅', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '今日领取', exact: true })).toBeVisible()
  const sprout = page.getByAltText('两片嫩叶的3D小树芽')
  expect(await sprout.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 160)).toBe(true)
  await expect(page.getByText(/树芽兑换|今日任务|每日任务|我的树芽|每一份|两件小事|消费|核对已有/)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('care-simple-checkin.png') })
  await page.getByRole('button', { name: /Lv\./ }).click()
  await expect(page.getByRole('heading', { name: '成长等级', exact: true })).toBeVisible()
  await expect(page.getByText('300 树芽', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: /我的成就/ }).click()
  await expect(page.getByRole('heading', { name: '我的成就', exact: true })).toBeVisible()
  await expect(page.getByText('累计签到30次', { exact: true })).toBeVisible()
  await expect(page.getByText(/今日任务|兑换|回响|值得纪念/)).toHaveCount(0)
  const before = await (await request.get('/api/care-journey', { headers })).json()
  for (const path of ['exchange', 'themes', 'sprouts']) {
    await page.goto(`/care-journey/${path}`)
    await expect(page).toHaveURL(/\/care-journey$/)
    await expect(page.getByRole('heading', { name: '呵护之旅', exact: true })).toBeVisible()
  }
  for (const path of ['redeem', 'task/verify', 'task-material/confirm']) {
    const response = await request.post(`/api/care-journey/${path}`, { headers, data: { productId: 'theme-mist-blue', requestId: 'retired-check', materialId: 'old' } })
    expect(response.status()).toBe(410)
  }
  const after = await (await request.get('/api/care-journey', { headers })).json()
  expect(after.balance).toBe(before.balance)
  expect(after.lifetime).toBe(before.lifetime)
  expect(after.today.task).toBeNull()
})
