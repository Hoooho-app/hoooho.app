import { expect, test } from '@playwright/test'

const seenKey = 'hoooho:welcome:seen:v1'

test('first open shows the approved copy and any page can start the existing login', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /孩子的情况，\s*不必全凭回忆。/ })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const art = page.locator('.hoooho-onboarding__art-sprite').first()
  await expect(art.locator('image')).toHaveAttribute('href', '/onboarding/hoooho-onboarding-art.png')
  expect((await page.request.get('/onboarding/hoooho-onboarding-art.png')).ok()).toBeTruthy()
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('01-present.png') })
  await page.getByRole('button', { name: '第 2 页：看清经过' }).click()
  await expect(page.getByRole('heading', { name: /零散的记录，\s*连成清楚的经过。/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '第 2 页：看清经过' })).toHaveAttribute('aria-current', 'step')
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('02-timeline.png') })
  await page.getByRole('button', { name: '第 3 页：从容转述' }).click()
  await expect(page.getByRole('heading', { name: /跟 AI 或医生，\s*一句话说清楚。/ })).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('03-retell.png') })
  const start = page.getByRole('button', { name: '开始', exact: true })
  const box = await start.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await start.click()
  await expect(page.getByRole('tab', { name: '注册', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '登录', exact: true })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), seenKey)).toBe('true')
  await page.reload()
  await expect(page.getByRole('tab', { name: '登录', exact: true })).toBeVisible()
  await expect(page.locator('.hoooho-onboarding')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('swiping, keyboard, skip and explicit replay work without auto advance', async ({ page, context }, testInfo) => {
  await page.goto('/welcome')
  const window = page.locator('.hoooho-onboarding__window')
  await expect(window).toBeVisible()
  const box = (await window.boundingBox())!
  const x = box.x + box.width * .8, y = box.y + box.height * .7
  if (testInfo.project.name !== 'desktop') {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 120, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 120, y, { steps: 6 })
    await page.mouse.up()
  }
  await expect(page.getByRole('button', { name: '第 2 页：看清经过' })).toHaveAttribute('aria-current', 'step')
  await page.locator('.hoooho-onboarding').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('heading', { name: /跟 AI 或医生，\s*一句话说清楚。/ })).toBeVisible()
  await page.keyboard.press('Home')
  await expect(page.getByRole('heading', { name: /孩子的情况，\s*不必全凭回忆。/ })).toBeVisible()
  await page.getByRole('button', { name: /跳过.*介绍，进入注册与登录/ }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByPlaceholder('输入你的昵称')).toBeVisible()
  await page.goto('/welcome')
  await expect(page.getByRole('heading', { name: /孩子的情况，\s*不必全凭回忆。/ })).toBeVisible()
})

test('starting still works if preference storage is blocked and motion is reduced', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'hoooho:welcome:seen:v1') throw new DOMException('Blocked', 'SecurityError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/login')
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(page.getByPlaceholder('输入你的昵称')).toBeVisible()
})

test('the original protected destination survives intro and real nickname registration', async ({ page }, testInfo) => {
  const target = '/settings/privacy?source=welcome#privacy'
  await page.goto(target)
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await page.getByRole('tab', { name: '注册', exact: true }).click()
  await page.getByPlaceholder('给自己起个昵称').fill(`开场${testInfo.project.name.slice(0,5)}${Date.now().toString().slice(-7)}`)
  await page.getByPlaceholder('设置一个密码').fill('welcome-test-password')
  await page.getByRole('button', { name: '注册并进入', exact: true }).click()
  await expect(page).toHaveURL(target)
  await page.evaluate(key => localStorage.removeItem(key), seenKey)
  await page.goto('/login')
  await expect(page).toHaveURL(/\/nurse-station$/)
  await expect(page.locator('.hoooho-onboarding')).toHaveCount(0)
})
