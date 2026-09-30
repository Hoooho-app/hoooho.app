import { expect, test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('time-view-e2e-local-only-secret', 60 * 60_000).create({ id: 'time-view-test-account' })

for (const width of [375, 390, 430, 1280]) test(`record category sheets return one level at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 667 })
  await page.addInitScript((authToken) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'time-view-test-account' }, currentMemberId: 'child-one', members: [], profile: null }, version: 5 }))
  }, token)
  await page.goto('/health-events')
  await page.getByRole('button', { name: '记一下', exact: true }).click()
  await page.getByRole('dialog', { name: '记一下' }).getByRole('button', { name: '记录日常' }).click()

  const daily = page.getByRole('dialog', { name: '记录日常' })
  await expect(daily.getByRole('button', { name: '返回记录入口' })).toBeVisible()
  await daily.screenshot({ path: `test-results/record-daily-back-${width}.png` })
  await daily.getByRole('button', { name: '喂养/饮食' }).click()

  const diet = page.getByRole('dialog', { name: '记录喂养/饮食' })
  await expect(diet.getByRole('button', { name: '返回记录日常' })).toBeVisible()
  await diet.screenshot({ path: `test-results/record-diet-back-${width}.png` })
  await diet.getByRole('button', { name: '返回记录日常' }).click()
  await expect(daily).toBeVisible()
  await expect(daily.getByRole('button', { name: '喂养/饮食' })).toBeVisible()

  await daily.getByRole('button', { name: '返回记录入口' }).click()
  await expect(page.getByRole('dialog', { name: '记一下' })).toBeVisible()
})
