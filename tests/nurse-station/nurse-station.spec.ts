import { expect, test } from '@playwright/test'

test('iPhone SE nurse station keeps the avatar, idle visual and warmth copy stable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/login')
  await page.getByRole('button', { name: '暂不登录，先体验' }).click()
  await expect(page).toHaveURL(/nurse-station/)
  await page.goto('/family/new')
  await page.getByRole('textbox', { name: '姓名' }).fill('小禾')
  await page.getByRole('textbox', { name: '出生日期' }).pressSequentially('20250801')
  await page.getByRole('button', { name: '男', exact: true }).click()
  await page.getByRole('combobox', { name: '你是孩子的谁？' }).selectOption({ label: '妈妈' })
  await page.getByRole('button', { name: '添加家庭成员', exact: true }).click()
  await expect(page).toHaveURL(/family/)
  await page.goto('/nurse-station')
  const tutorialClose = page.getByRole('button', { name: '关闭教程' })
  await expect(tutorialClose).toBeVisible()
  await tutorialClose.click()

  const avatar = page.getByRole('img', { name: '小禾的3D卡通头像' })
  const warmth = page.getByText('我们会在这里陪你照看 小禾 的健康记录。')
  await expect(avatar).toBeVisible()
  await expect(warmth).toBeVisible()
  const avatarBox = await avatar.boundingBox()
  const visualBox = await page.getByRole('figure', { name: '护士导诊台' }).boundingBox()
  const warmthBox = await warmth.boundingBox()
  expect(avatarBox).toMatchObject({ width: 36, height: 36 })
  expect(visualBox!.width).toBeGreaterThanOrEqual(295)
  expect(visualBox!.width).toBeLessThanOrEqual(330)
  expect(warmthBox!.height).toBeLessThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  expect(await page.locator('.idle-nurse-visual video').count()).toBe(3)

  const before = visualBox!
  await page.getByRole('button', { name: '打开菜单' }).click()
  await expect(page.getByRole('button', { name: '关闭菜单' })).toBeVisible()
  await page.getByRole('button', { name: '关闭菜单' }).click()
  await expect(page.getByRole('figure', { name: '护士导诊台' })).toBeVisible()
  expect(await page.getByRole('figure', { name: '护士导诊台' }).boundingBox()).toEqual(before)
  await page.screenshot({ path: 'test-results/nurse-station-iphone-se.png', fullPage: true })
  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    await expect(avatar).toBeVisible()
    await expect(warmth).toBeVisible()
  }
  expect(errors).toEqual([])
})
