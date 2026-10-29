import { test, expect } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }

test('existing knowledge article preserves saved reading on mobile after homepage replacement', async ({ page, request }, info) => {
  const response = await request.post('/api/members', { headers, data: { name: '科普验收（虚构）', relationship: 'child' } })
  const { id: memberId } = await response.json()
  await request.post(`/api/members/${memberId}/case-records`, { headers, data: { requestId: crypto.randomUUID(), text: '头皮发痒', occurredAt: new Date(Date.now() - 60000).toISOString(), files: [], journal: { categories: ['symptom'] } } })
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.clock.install({ time: new Date('2026-10-17T04:00:00Z') })
  for (const size of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(size)
    await page.goto('/allergy-knowledge/positive-test-and-food-avoidance')
    await expect(page.getByRole('heading', { name: '过敏检测阳性，就一定要忌口吗？', exact: true })).toBeVisible()
    await expect(page.getByText(/明天聊|明日预告/)).toHaveCount(0)
    expect((await page.locator('.allergy-knowledge-body').innerText()).length).toBeGreaterThan(600)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const bookmark = page.getByRole('button', { name: '收藏', exact: true })
    if (await bookmark.isVisible()) await bookmark.click()
    const savedBookmark = page.getByRole('button', { name: '已收藏', exact: true })
    await expect(savedBookmark).toHaveAttribute('aria-pressed', 'true')
    expect(await savedBookmark.locator('[aria-live]').evaluate(label => {
      const range = document.createRange()
      range.selectNodeContents(label)
      return range.getClientRects().length
    })).toBe(1)
    const bookmarkBox = (await savedBookmark.boundingBox())!
    const headerTitleBox = (await page.getByRole('heading', { name: '过敏小知', exact: true }).boundingBox())!
    expect(bookmarkBox.height).toBeGreaterThanOrEqual(44)
    expect(bookmarkBox.x).toBeGreaterThanOrEqual(headerTitleBox.x + headerTitleBox.width)
    expect(bookmarkBox.x + bookmarkBox.width).toBeLessThanOrEqual(size.width)
    await page.getByText('参考依据', { exact: true }).click()
    await expect(page.getByRole('link', { name: /美国儿科学会/ })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`knowledge-article-${size.width}.png`) })
    await page.getByRole('button', { name: '往期内容', exact: true }).click()
    await expect(page.getByRole('region', { name: '往期内容' })).toContainText('已收藏')
    await page.getByRole('button', { name: /过敏检测阳性，就一定要忌口吗/ }).click()
    await expect(page.getByRole('button', { name: '已收藏', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await expect(page).toHaveURL(/\/nurse-station$/)
    await expect(page.getByRole('link', { name: '今日呵护：查看呵护之旅', exact: true })).toBeVisible()
  }
  await page.goto('/allergy-knowledge/missing-article')
  await expect(page.getByText('这篇内容暂不可用')).toBeVisible()
})
