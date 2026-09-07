import { expect, test, type Locator, type Page } from '@playwright/test'

async function swipeLeft(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  await page.mouse.move(box!.x + box!.width * .8, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + 8, box!.y + box!.height / 2, { steps: 6 })
  await page.mouse.up()
}

test('iPhone SE nurse bubbles are contextual, grouped, dismissible and safe', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    const pendingState = sessionStorage.getItem('nurse-station-test-state')
    if (!pendingState) return
    Object.keys(localStorage).filter((key) => key.startsWith('hoooho:nurse-station:v1:')).forEach((key) => localStorage.setItem(key, pendingState))
    sessionStorage.removeItem('nurse-station-test-state')
  })
  await page.goto('/login')
  await page.getByRole('button', { name: '暂不登录，先体验' }).click()
  await expect(page).toHaveURL(/nurse-station/)
  await page.goto('/family/new')
  await page.getByRole('textbox', { name: '姓名' }).fill('123')
  await page.getByRole('textbox', { name: '出生日期' }).pressSequentially('20260901')
  await page.getByRole('button', { name: '男', exact: true }).click()
  await page.getByRole('combobox', { name: '你是孩子的谁？' }).selectOption({ label: '妈妈' })
  await page.getByRole('button', { name: '添加家庭成员', exact: true }).click()
  await page.goto('/nurse-station')
  await expect(page.getByRole('button', { name: '就医准备', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '摘要生成', exact: true })).toHaveCount(0)

  const now = new Date().toISOString()
  const makeItem = (id: string, status: string, changes: Record<string, unknown> = {}) => ({ id, memberId: 'fixture-child', sourceEventId: `event-${id}`, relatedEventIds: [`event-${id}`], type: 'symptom_observation', status, title: '值得继续留意', sourceLabel: `${id} · 9/8 10:00`, createdAt: now, updatedAt: now, ...changes })
  const setStation = async (items: ReturnType<typeof makeItem>[], tutorialSeen = true) => {
    await page.evaluate(({ items, tutorialSeen }) => {
      const value = JSON.stringify({ tutorialSeen, loginNoticeDismissed: false, suppressedTypes: [], handledBubbleKeys: [], animatedBubbleKeys: [], items })
      sessionStorage.setItem('nurse-station-test-state', value)
      window.location.reload()
    }, { items, tutorialSeen })
    await page.waitForLoadState('domcontentloaded')
  }

  // 1. No messages: no fixed cards, centered nurse video, tasks remain available.
  await setStation([])
  await expect(page.locator('.nurse-bubble')).toHaveCount(0)
  await expect(page.locator('.nurse-bubble-stage')).toHaveAttribute('data-has-bubbles', 'false')
  await expect(page.getByText('暂无守护任务')).toBeVisible()
  await page.screenshot({ path: 'test-results/nurse-bubbles-none-iphone-se.png', fullPage: true })

  // 2. A first-use tutorial is one temporary bubble and does not return after dismissal.
  await setStation([makeItem('history', 'completed')], false)
  await expect(page.getByRole('button', { name: '使用教程', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '擦除使用教程' }).click()
  await expect(page.getByRole('button', { name: '使用教程', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: '使用教程', exact: true })).toHaveCount(0)

  // 3. Three different observation topics become one grouped bubble.
  const attentionItems = [makeItem('发热', 'pending_confirmation'), makeItem('咳嗽', 'pending_confirmation'), makeItem('皮肤变化', 'pending_confirmation')]
  await setStation(attentionItems)
  await expect(page.locator('.nurse-bubble')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '值得继续留意，3项' })).toBeVisible()

  // 4. Only two full bubbles render; lower-priority messages fold into one summary.
  const multiTypeItems = [makeItem('安全', 'active', { title: '安全提醒：症状明显加重' }), makeItem('发热', 'pending_confirmation'), makeItem('护理', 'active', { type: 'follow_up', title: '护理小贴士' })]
  await setStation(multiTypeItems, false)
  await expect(page.locator('.nurse-bubble')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '安全提醒', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '值得继续留意', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '还有 2 条' })).toBeVisible()
  await page.screenshot({ path: 'test-results/nurse-bubbles-multiple-iphone-se.png', fullPage: true })

  // 5. A regular bubble can be swiped away without affecting guardian tasks.
  await setStation(attentionItems)
  await swipeLeft(page, page.getByRole('button', { name: '值得继续留意，3项' }))
  await expect(page.getByRole('button', { name: '值得继续留意，3项' })).toHaveCount(0)
  await expect(page.getByText('共 0 项守护任务')).toBeVisible()

  // 6. Explicit confirmation converts one message into one task and reduces the bubble count.
  await setStation(attentionItems)
  await page.getByRole('button', { name: '值得继续留意，3项' }).click()
  await expect(page.getByRole('dialog', { name: '值得继续留意' })).toBeVisible()
  await page.getByRole('button', { name: '加入守护任务' }).first().click()
  await expect(page.getByText('共 1 项守护任务')).toBeVisible()
  await expect(page.getByRole('button', { name: '值得继续留意，2项' })).toBeVisible()

  // 7. A safety bubble cannot disappear from one swipe and requires an explicit action.
  await setStation([makeItem('安全', 'active', { title: '安全提醒：症状明显加重' })])
  const safety = page.getByRole('button', { name: '安全提醒', exact: true })
  await swipeLeft(page, safety)
  await expect(page.getByRole('dialog', { name: '安全提醒' })).toBeVisible()
  await page.getByRole('dialog', { name: '安全提醒' }).getByLabel('关闭安全提醒').click()
  await expect(safety).toBeVisible()
  await safety.click()
  await page.getByRole('button', { name: '我知道了' }).click()
  await expect(safety).toHaveCount(0)

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  expect(await page.locator('.idle-nurse-visual video').count()).toBe(3)
  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
  }
  expect(errors).toEqual([])
})
