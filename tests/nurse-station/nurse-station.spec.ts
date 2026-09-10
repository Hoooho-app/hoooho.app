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

test('护士站待机1使用单一资源连续无缝循环', async ({ page }) => {
  test.setTimeout(45_000)
  const mediaRequests: string[] = []
  page.on('request', (request) => {
    if (/\.(?:mp4|webm)(?:\?|$)/.test(request.url())) mediaRequests.push(request.url())
  })

  await registerAccount(page)
  await page.goto('/nurse-station')
  const video = page.locator('.idle-nurse-visual video[data-video-phase="idle1"]')
  await expect(video).toHaveCount(1)
  await expect(video).toHaveAttribute('src', /nurse-station-idle-1/)
  await expect(video).toHaveAttribute('poster', /nurse-station-idle-1-poster/)
  await expect(video).toHaveAttribute('loop', '')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => ({
    height: element.videoHeight,
    paused: element.paused,
    time: element.currentTime,
    width: element.videoWidth
  }))).toMatchObject({ height: 480, paused: false, width: 480 })

  await video.evaluate((element) => { element.dataset.loopTestIdentity = 'stable-idle1' })
  for (let loop = 0; loop < 10; loop += 1) {
    await video.evaluate((element: HTMLVideoElement) => { element.currentTime = element.duration - 0.12 })
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime < 0.8 && !element.paused), { timeout: 3_000 }).toBe(true)
    await expect(video).toHaveAttribute('data-loop-test-identity', 'stable-idle1')
  }

  const uniqueMedia = [...new Set(mediaRequests.map((url) => new URL(url).pathname))]
  expect(uniqueMedia).toHaveLength(1)
  expect(uniqueMedia[0]).toContain('nurse-station-idle-1')
  expect(uniqueMedia.join(' ')).not.toMatch(/nurses-idle-intro|nurses-idle-loop/)
})

test('护士站服务排序、开放状态和用药入口符合移动端方案', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await registerMember(page)
  await expect(page.locator('.nurse-station-member')).toHaveCSS('height', '52px')
  await expect(page.locator('.nurse-station-member')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('.nurse-station-member > svg')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '就医准备', exact: true })).toHaveCSS('height', '52px')
  await expect(page.getByRole('button', { name: '就医准备', exact: true }).locator('svg')).toHaveCount(1)
  const services = page.locator('.nurse-service-entry')
  await expect(services).toHaveCount(5)
  await expect(services).toHaveText(['症状观察', '提醒服务', '排敏测试', '医嘱跟进', '冲突提醒'])
  await expect(services.locator('svg')).toHaveCount(5)
  await expect(page.getByText('已归档', { exact: true })).toBeVisible()
  await expect(page.getByText(/共 \d+ 项守护任务/)).toHaveCount(0)
  for (let index = 0; index < 3; index += 1) await expect(services.nth(index)).toBeEnabled()
  for (let index = 3; index < 5; index += 1) {
    await expect(services.nth(index)).toBeDisabled()
    await expect(services.nth(index)).toHaveAttribute('aria-disabled', 'true')
  }
  await expect(page.locator('.nurse-station-visual')).toHaveCSS('border-top-width', '0px')
  await expect(page.locator('.nurse-station-visual')).toHaveCSS('box-shadow', 'none')
  await expect(page.getByText('守护任务', { exact: true })).toBeVisible()
  await expect(page.locator('.guardian-task-list')).toBeInViewport()
  const idleVideo = page.locator('.idle-nurse-visual video[data-video-phase="idle1"]')
  await expect(idleVideo).toHaveCount(1)
  await expect(idleVideo).toHaveAttribute('src', /nurse-station-idle-1/)
  await expect(idleVideo).toHaveAttribute('poster', /nurse-station-idle-1-poster/)
  await expect(idleVideo).toHaveAttribute('loop', '')
  await expect(idleVideo).toHaveAttribute('preload', 'auto')
  await expect.poll(() => idleVideo.evaluate((video: HTMLVideoElement) => !video.paused && video.currentTime > 0 && video.videoWidth === 480 && video.videoHeight === 480)).toBe(true)
  await services.first().click()
  await expect(page).toHaveURL(/\/health-events$/)
  await expect(page.getByRole('dialog', { name: '记录症状' })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()
  await page.goto('/nurse-station')
  await page.locator('.nurse-service-entry').nth(2).click()
  await expect(page).toHaveURL(/\/health-profile\/allergy$/)
  await page.goto('/nurse-station')
  const currentServices = page.locator('.nurse-service-entry')
  await currentServices.nth(1).click()
  const reminders = page.getByRole('dialog', { name: '提醒服务' })
  await expect(reminders).toBeVisible()
  await expect(reminders.getByRole('button', { name: /用药提醒/ })).toContainText('按计划提醒用药，并记录是否已经完成')
  await reminders.getByRole('button', { name: /用药提醒/ }).click()
  await expect(page).toHaveURL(/\/health-events/)
  await expect(page.getByRole('dialog', { name: /记录用药/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 667 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/nurse-station')
    await expect(page.locator('.nurse-service-entry')).toHaveCount(5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
  }
  expect(errors).toEqual([])
})
