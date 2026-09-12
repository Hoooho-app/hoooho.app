import { expect, test, type Page } from '@playwright/test'

let registrationSequence = 0

async function registerAccount(page: Page) {
  registrationSequence += 1
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${registrationSequence}` })
  await page.goto('/login')
  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(`护士站测试${Date.now().toString().slice(-8)}`)
  await page.getByPlaceholder('设置一个密码').fill('12345678')
  await page.getByRole('button', { name: '注册并进入' }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
}

async function registerMember(page: Page) {
  await registerAccount(page)
  await page.goto('/family/new')
  await page.getByRole('textbox', { name: '姓名' }).fill('123')
  await page.getByRole('textbox', { name: '出生日期' }).pressSequentially('20260901')
  await page.getByRole('button', { name: '男', exact: true }).click()
  await page.getByRole('combobox', { name: '你是孩子的谁？' }).selectOption({ label: '妈妈' })
  await page.getByRole('button', { name: '添加家庭成员', exact: true }).click()
  await page.goto('/nurse-station')
}

test('护士站待机视频仍使用真实单一循环资源', async ({ page }) => {
  await registerMember(page)
  const video = page.locator('.idle-nurse-visual video[data-video-phase="idle1"]')
  await expect(video).toHaveCount(1)
  await expect(video).toHaveAttribute('loop', '')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => ({ height: element.videoHeight, paused: element.paused, width: element.videoWidth }))).toMatchObject({ height: 360, paused: false, width: 360 })
})

test('参考图首页在 iPhone SE 上保持核心入口和守护任务交互', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await registerMember(page)
  await expect(page.locator('.nurse-station-hero')).toBeVisible()
  await expect(page.locator('.nurse-station-identity')).toContainText('123')
  await expect(page.locator('.nurse-station-guarded')).toContainText('已守护')
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('height', '150px')
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('.nurse-station-hero')).toHaveCSS('border-color', 'rgb(220, 237, 234)')
  await expect(page.locator('.nurse-station-visual')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  const facts = ['全球食物过敏率约3%～8%', '约1/4人群受各类过敏疾病影响', '中国2岁内儿童食物过敏检出率约3.5%～7.7%', '过敏反应可能涉及多个身体系统', '时间、诱因和频率都是重要线索', '你已经更早一步留下判断线索']
  for (const fact of facts) {
    const metrics = await page.locator('.nurse-station-fact').evaluate((element, text) => {
      const copy = element.querySelector('span')
      if (copy) copy.textContent = text
      return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }
    }, fact)
    expect(metrics.scrollHeight).toBeLessThanOrEqual(36)
    expect(metrics.clientHeight).toBeLessThanOrEqual(36)
  }
  await expect(page.locator('.nurse-primary-entries strong')).toHaveText(['健康随记', '健康档案'])
  await expect(page.locator('.nurse-primary-entries small')).toHaveText(['每天记一点，变化有迹可循', '想起来就补，信息更完整'])
  await expect(page.locator('.nurse-more-services strong')).toHaveText(['过敏出示', '能不能吃', '附近就医'])
  await expect(page.getByText('就诊情况单', { exact: true })).toHaveCount(0)
  await expect(page.getByText('说明与帮助', { exact: true })).toHaveCount(0)
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveText(['提醒服务', '症状观察', '排敏测试'])
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('新增用药提醒', { exact: true })).toBeVisible()
  await expect(page.getByText('创建下一次用药提醒', { exact: true })).toBeVisible()
  await tabs.nth(1).click()
  await expect(page.getByText('新增症状观察', { exact: true })).toBeVisible()
  await tabs.nth(2).click()
  await expect(page.getByText('新增排敏测试', { exact: true })).toBeVisible()
  await page.locator('.guardian-task-view').click()
  await page.getByRole('button', { name: '已归档任务', exact: true }).click()
  await expect(page.locator('.guardian-task-view')).toHaveText(/已归档任务/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  for (const viewport of [{ width: 320, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
  }
  expect(errors).toEqual([])
})
