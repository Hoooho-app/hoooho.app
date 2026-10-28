import { expect, test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const paper = 'rgb(244, 242, 237)'
const diagnostics = [
  '部分原选照片已失效或不再关联本次主诉；未自动换成其他照片。',
  '先前选择的症状已不可用；选择模式仍保留，请重新核对来源。',
  '合成状态诊断，不应显示在情况单',
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(authToken => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authUser: { id: 'visit-test' }, currentMemberId: 'child-a', members: [], profile: null,
    }, version: 5 }))
  }, token)
})

test('情况单直接展示资料，后台诊断不占位；编辑、刷新与加载重试正常', async ({ page }, info) => {
  await page.route('**/api/members/child-a/visit-sheet', async route => {
    const response = await route.fetch(), body = await response.json()
    if (body.report) {
      body.report.warnings = diagnostics.slice(0, 2)
      body.warnings = diagnostics.slice(2)
    }
    await route.fulfill({ response, json: body })
  })
  await page.goto('/visit-summary')
  await expect(page.locator('.visit-reading-person')).toBeVisible()
  for (const diagnostic of diagnostics) await expect(page.getByText(diagnostic, { exact: true })).toHaveCount(0)
  await expect(page.locator('.visit-report-scroll > :first-child')).toHaveClass('visit-reading')
  await page.getByRole('button', { name: '目前情况', exact: true }).click()
  await page.getByRole('button', { name: '编辑情况描述', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '编辑情况描述', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭编辑情况描述', exact: true }).click()
  await page.reload()
  await expect(page.locator('.visit-reading-person')).toBeVisible()
  for (const diagnostic of diagnostics) await expect(page.getByText(diagnostic, { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('visit-report-without-diagnostics.png') })

  await page.unroute('**/api/members/child-a/visit-sheet')
  await page.route('**/api/members/child-a/visit-sheet', route => route.fulfill({ status: 503, json: { error: { message: '合成读取失败' } } }))
  await page.reload()
  await expect(page.getByText('情况单暂时无法打开', { exact: true })).toBeVisible()
  await page.unroute('**/api/members/child-a/visit-sheet')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('.visit-reading-person')).toBeVisible()
})

test('各页上下边缘和底导贯穿纸张背景', async ({ page }, info) => {
  for (const route of ['/nurse-station', '/health-calendar', '/health-profile', '/visit-summary', '/settings', '/help', '/quick-search', '/smart-record', '/care-handoff']) {
    await page.goto(route)
    await expect(page.locator('main').first()).toBeVisible()
    if (route === '/visit-summary') await expect(page.locator('.visit-reading-person')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    for (const node of await page.locator('html, body, #root, .hoho-bottom-navigation, .visit-report').all()) {
      await expect(node).toHaveCSS('background-color', paper)
    }
    const edges = await page.evaluate(() => {
      const backgroundAt = (y: number) => document.elementsFromPoint(2, y)
        .map(element => getComputedStyle(element).backgroundColor)
        .find(color => color !== 'rgba(0, 0, 0, 0)')
      return { top: backgroundAt(2), bottom: backgroundAt(innerHeight - 2), width: innerWidth, documentWidth: document.documentElement.scrollWidth }
    })
    expect(edges.top, `top edge of ${route}`).toBe(paper)
    expect(edges.bottom, `bottom edge of ${route}`).toBe(paper)
    expect(edges.documentWidth).toBeLessThanOrEqual(edges.width)
    await page.screenshot({ path: info.outputPath(`${route.slice(1)}-paper.png`) })
  }
})
