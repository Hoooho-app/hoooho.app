import { expect, test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
import { maskIdentityName } from '../../src/utils/privateIdentity'


test('guarded days use each child profile creation date without records or check-ins and advance across midnight', async ({ page, request }, info) => {
  const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
  const headers = { Authorization: `Bearer ${token}` }
  const children = []
  // Mobile projects share this synthetic account; keep each pair's visible identity unique.
  const endings = info.project.name === 'mobile-320' ? ['甲', '乙'] : info.project.name === 'mobile-390' ? ['丙', '丁'] : ['戊', '己']
  const names = endings.map(ending => `建档${ending}`)
  for (const name of names) {
    const response = await request.post('/api/members', { headers, data: { name, relationship: 'child', birthday: '2024-01-01', gender: 'female' } })
    expect(response.ok()).toBe(true)
    children.push(await response.json())
  }
  // Only the test's member read is backdated; no production or persisted creation time is rewritten.
  await page.route('**/api/members', async route => {
    if (route.request().method() !== 'GET') { await route.continue(); return }
    const response = await route.fetch()
    const members = await response.json()
    await route.fulfill({ response, json: members.map((member: { id: string; createdAt: string }) => ({ ...member,
      createdAt: member.id === children[0].id ? '2026-10-15T03:00:00Z' : member.id === children[1].id ? '2026-10-27T03:00:00Z' : member.createdAt
    })) })
  })
  await page.clock.install({ time: new Date('2026-10-30T04:00:00Z') })
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId: children[0].id })
  let claims = 0
  page.on('request', request => { if (request.url().endsWith('/api/care-journey/check-in') && request.method() === 'POST') claims++ })
  await page.goto('/nurse-station')
  const count = page.locator('.front-desk-welcome__care strong')
  await expect(count).toHaveText('已守护 16 天')
  await page.reload()
  await expect(count).toHaveText('已守护 16 天')
  await page.getByRole('button', { name: '切换记录对象', exact: true }).click()
  await page.getByRole('dialog', { name: '我的孩子', exact: true }).getByRole('button', { name: `切换到${maskIdentityName(names[1])}`, exact: true }).click()
  await expect(count).toHaveText('已守护 4 天')
  await page.clock.setSystemTime(new Date('2026-10-31T04:00:00Z'))
  await page.clock.fastForward(60001)
  await expect(count).toHaveText('已守护 5 天')
  expect(claims).toBe(0)
})

test('daily claim persists across homepage, task page and refresh without duplicate reward', async ({ page, request }, info) => {
  const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
  const headers = { Authorization: `Bearer ${token}` }
  const member = await request.post('/api/members', { headers, data: { name: '呵护验收', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(member.ok()).toBe(true)
  const memberId = (await member.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/nurse-station')
  const card = page.locator('.front-desk-welcome__care')
  await expect(card.locator('strong')).toHaveText('已守护 1 天')
  const guarded = await card.locator('strong').innerText()
  // Each mobile project shares the synthetic server account; use its real starting state.
  const before = await (await request.get('/api/care-journey', { headers })).json()
  const cardBefore = await card.boundingBox()
  if (before.today.checkedIn) {
    await expect(card.getByRole('button', { name: '今日已领取' })).toBeDisabled()
  } else {
    await page.route('**/api/care-journey/check-in', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEST_UNAVAILABLE', message: '模拟网络失败' } }) }), { times: 1 })
    await card.getByRole('button', { name: '领取树苗', exact: true }).click()
    await expect(page).toHaveURL(/\/nurse-station$/)
    await expect(card.getByRole('status')).toHaveText('暂未确认，请重试')
    await expect(card.locator('strong')).toHaveText(guarded)
    await card.getByRole('button', { name: '重试领取', exact: true }).click()
    await expect(card.getByRole('button', { name: '今日已领取', exact: true })).toBeDisabled()
  }
  await expect(page).toHaveURL(/\/nurse-station$/)
  const after = await (await request.get('/api/care-journey', { headers })).json()
  expect(after.careDays).toBe(before.careDays + (before.today.checkedIn ? 0 : 1))
  expect(after.balance).toBe(before.balance + (before.today.checkedIn ? 0 : 1))
  expect(after.ledger.filter((row: { kind: string; label: string }) => row.kind === 'reward' && row.label === '每日呵护')).toHaveLength(after.careDays)
  expect(await card.boundingBox()).toEqual(cardBefore)
  expect(await card.locator('button button, a button, button a').count()).toBe(0)
  const buttonBox = (await card.getByRole('button').boundingBox())!
  expect(buttonBox.height).toBeGreaterThanOrEqual(44)
  expect(Math.abs(buttonBox.x + buttonBox.width / 2 - (cardBefore!.x + cardBefore!.width / 2))).toBeLessThan(1)
  await expect(card.getByRole('button').locator('img')).toHaveAttribute('src', /two-leaf-sprout/)
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(cardBefore!.y + cardBefore!.height)
  await page.screenshot({ path: info.outputPath('today-care-claimed.png') })
  await page.getByRole('link', { name: '今日呵护：查看任务', exact: true }).click()
  await expect(page).toHaveURL(/\/care-journey$/)
  await expect(page.getByRole('button', { name: '已呵护', exact: true })).toBeDisabled()
  await expect(page.getByText('共同照顾', { exact: true })).toHaveCount(0)
  await page.goBack()
  await page.reload()
  await expect(card.getByRole('button', { name: '今日已领取', exact: true })).toBeDisabled()
  await expect(card.locator('strong')).toHaveText(guarded)
  const duplicate = await request.post('/api/care-journey/check-in', { headers, data: {} })
  expect(duplicate.ok()).toBe(true)
  expect((await duplicate.json()).balance).toBe(after.balance)
})
