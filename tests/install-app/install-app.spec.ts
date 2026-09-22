import { expect, test, type Page } from '@playwright/test'

let registrationSequence = 120

async function enterApp(page: Page) {
  registrationSequence += 1
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${registrationSequence}` })
  await page.goto('/login')
  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(`安装测试${Date.now().toString().slice(-8)}`)
  await page.getByPlaceholder('设置一个密码').fill('12345678')
  await page.getByRole('button', { name: '注册并进入' }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
}

async function addMember(page: Page) {
  await page.goto('/family/new')
  await page.getByRole('textbox', { name: '姓名' }).fill('安装测试宝宝')
  await page.getByRole('textbox', { name: '出生日期' }).pressSequentially('20260901')
  await page.getByRole('button', { name: '女', exact: true }).click()
  await page.getByRole('combobox', { name: '你是孩子的谁？' }).selectOption({ label: '妈妈' })
  await page.getByRole('button', { name: '添加家庭成员', exact: true }).click()
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
}

test('iOS Safari 全局入口打开双图引导并可关闭恢复焦点', async ({ page }) => {
  await enterApp(page)
  const trigger = page.getByRole('button', { name: '添加 Hoooho 到主屏' })
  await expect(trigger).toBeVisible()
  const headerMetrics = await page.locator('.hoho-main-header').evaluate((header) => {
    const titleNode = header.querySelector('h1')!
    const titleRange = document.createRange()
    titleRange.selectNodeContents(titleNode)
    const title = titleRange.getBoundingClientRect()
    const triggerBox = header.querySelector('.install-app-trigger')!.getBoundingClientRect()
    return { centerDelta: Math.abs((title.left + title.right) / 2 - window.innerWidth / 2), overlap: title.right > triggerBox.left }
  })
  expect(headerMetrics.centerDelta).toBeLessThan(1)
  expect(headerMetrics.overlap).toBe(false)

  await trigger.click()
  const guide = page.getByRole('dialog', { name: '添加到主屏幕' })
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('heading', { name: '添加到主屏幕' })).toBeVisible()
  await expect(guide.locator('.install-guide__number')).toHaveText(['1', '2'])
  await expect(guide.locator('img')).toHaveCount(2)
  await expect.poll(() => guide.locator('img').evaluateAll((images: HTMLImageElement[]) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: 'test-results/install-app-guide-375x667.png', fullPage: true })

  await page.keyboard.press('Escape')
  await expect(guide).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await guide.getByRole('button', { name: '关闭添加到主屏幕图示' }).click()

  await addMember(page)
  for (const route of ['/nurse-station', '/health-events', '/health-profile', '/settings', '/about']) {
    await page.goto(route)
    await expect(page.getByRole('button', { name: '添加 Hoooho 到主屏' })).toBeVisible()
  }
})

test('iOS Safari 确认已添加后持久隐藏入口', async ({ page }) => {
  await enterApp(page)
  const trigger = page.getByRole('button', { name: '添加 Hoooho 到主屏' })
  await trigger.click()
  await page.getByRole('dialog', { name: '添加到主屏幕' }).getByRole('button', { name: '我已添加，不再显示' }).click()
  await expect(trigger).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hoooho-install-app-confirmed'))).toBe('true')

  await page.goto('/about')
  await expect(page.getByRole('button', { name: '添加 Hoooho 到主屏' })).toHaveCount(0)
})

test('其他标签确认安装后当前页面同步隐藏入口', async ({ page }) => {
  await enterApp(page)
  const trigger = page.getByRole('button', { name: '添加 Hoooho 到主屏' })
  await expect(trigger).toBeVisible()
  await page.evaluate(() => {
    localStorage.setItem('hoooho-install-app-confirmed', 'true')
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'hoooho-install-app-confirmed',
      newValue: 'true',
    }))
  })
  await expect(trigger).toHaveCount(0)
})

test('原生安装提示取消后入口保留且不会重复调用', async ({ page }) => {
  await enterApp(page)
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: 'dismissed'; platform: string }>
    }
    let calls = 0
    event.prompt = async () => { calls += 1; (window as typeof window & { __installPromptCalls?: number }).__installPromptCalls = calls }
    event.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' })
    window.dispatchEvent(event)
  })
  const trigger = page.getByRole('button', { name: '添加 Hoooho 到主屏' })
  await trigger.click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __installPromptCalls?: number }).__installPromptCalls)).toBe(1)
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __installPromptCalls?: number }).__installPromptCalls)).toBe(1)
})

test('appinstalled 事件和独立显示模式都会隐藏全局入口', async ({ page }) => {
  await enterApp(page)
  await expect(page.getByRole('button', { name: '添加 Hoooho 到主屏' })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  await expect(page.getByRole('button', { name: '添加 Hoooho 到主屏' })).toHaveCount(0)
  await page.goto('/about')
  await expect(page.getByRole('button', { name: '添加 Hoooho 到主屏' })).toHaveCount(0)
})

test('navigator standalone 模式启动时不显示入口', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }))
  await enterApp(page)
  await expect(page.getByRole('button', { name: '添加 Hoooho 到主屏' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hoooho-install-app-confirmed'))).toBe('true')
})

test('Safari 图示加载失败时保留可关闭的最小失败状态', async ({ page }) => {
  await page.route('**/tutorials/add-to-home-screen/*.jpg', (route) => route.abort())
  await enterApp(page)
  await page.getByRole('button', { name: '添加 Hoooho 到主屏' }).click()
  const guide = page.getByRole('dialog', { name: '添加到主屏幕' })
  await expect(guide.getByRole('status')).toHaveText('图示暂时无法加载')
  await guide.getByRole('button', { name: '关闭添加到主屏幕图示' }).click()
  await expect(guide).toBeHidden()
})

for (const width of [390, 430]) {
  test(`${width}px 下入口、标题和引导无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await enterApp(page)
    await page.getByRole('button', { name: '添加 Hoooho 到主屏' }).click()
    await expect(page.getByRole('dialog', { name: '添加到主屏幕' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
}
