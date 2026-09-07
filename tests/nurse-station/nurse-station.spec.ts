import { expect, test } from '@playwright/test'

test('iPhone SE nurse station covers empty, small and pressure states', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
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

  const now = new Date().toISOString()
  const makeItem = (id: string, status: string, type = 'symptom_observation') => ({ id, memberId: 'fixture-child', sourceEventId: `event-${id}`, relatedEventIds: [`event-${id}`], type, status, title: type === 'medication_reminder' ? '需要设置下一次用药提醒吗？' : '要开启体温观察吗？', sourceLabel: `记录${id} · 9/8 10:00`, createdAt: now, updatedAt: now, ...(status === 'completed' ? { completedAt: now, completionResult: '已恢复' } : {}) })
  const setStation = async (items: ReturnType<typeof makeItem>[], tutorialSeen: boolean) => page.evaluate(({ items, tutorialSeen }) => {
    const value = JSON.stringify({ tutorialSeen, loginNoticeDismissed: false, suppressedTypes: [], items })
    Object.keys(localStorage).filter((key) => key.startsWith('hoooho:nurse-station:v1:')).forEach((key) => localStorage.setItem(key, value))
  }, { items, tutorialSeen })

  await setStation([], true)
  await page.reload()
  await expect(page.getByText('暂无守护任务')).toBeVisible()
  await expect(page.getByRole('button', { name: '护理小贴士' })).toBeVisible()
  await expect(page.getByRole('button', { name: '值得继续留意' })).toBeVisible()
  await expect(page.getByRole('button', { name: '使用教程' })).toBeVisible()
  await expect(page.getByText('未登录')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/nurse-station-empty-iphone-se.png', fullPage: true })

  await setStation([makeItem('active', 'active'), makeItem('pending', 'pending_confirmation', 'medication_reminder')], false)
  await page.reload()
  await expect(page.getByRole('button', { name: '护理小贴士，2项待查看' })).toBeVisible()
  await expect(page.getByRole('button', { name: '值得继续留意，1项待查看' })).toBeVisible()
  await expect(page.getByRole('button', { name: '使用教程，1项待查看' })).toBeVisible()
  await expect(page.getByText('共 1 项守护任务')).toBeVisible()
  await page.getByRole('button', { name: '值得继续留意，1项待查看' }).click()
  await expect(page.getByRole('dialog', { name: '值得继续留意' })).toBeVisible()
  await page.getByRole('button', { name: '加入守护任务' }).click()
  await expect(page.getByText('共 2 项守护任务')).toBeVisible()
  await page.getByRole('button', { name: '使用教程，1项待查看' }).click()
  await page.getByRole('button', { name: '完成教程' }).click()
  await expect(page.getByRole('button', { name: '使用教程' })).toBeVisible()
  await page.screenshot({ path: 'test-results/nurse-station-small-iphone-se.png', fullPage: true })

  const pressure = [
    ...Array.from({ length: 7 }, (_, index) => makeItem(`active-${index}`, 'active', index === 1 ? 'medication_reminder' : 'symptom_observation')),
    ...Array.from({ length: 12 }, (_, index) => makeItem(`pending-${index}`, 'pending_confirmation')),
    ...Array.from({ length: 18 }, (_, index) => makeItem(`done-${index}`, 'completed'))
  ]
  await setStation(pressure, false)
  await page.reload()
  await expect(page.getByRole('button', { name: '护理小贴士，9+项待查看' })).toBeVisible()
  await expect(page.getByRole('button', { name: '值得继续留意，9+项待查看' })).toBeVisible()
  await expect(page.getByRole('button', { name: '使用教程，1项待查看' })).toBeVisible()
  await expect(page.getByText('共 7 项守护任务')).toBeVisible()
  await expect(page.getByRole('button', { name: '已归档任务 18' })).toBeVisible()
  const tasks = page.locator('.guardian-task-card')
  await expect(tasks).toHaveCount(7)
  const secondTask = await tasks.nth(1).boundingBox()
  expect(secondTask!.y).toBeLessThan(667)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  expect(await page.locator('.idle-nurse-visual video').count()).toBe(3)
  await expect.poll(() => page.locator('.idle-nurse-visual video[data-active="true"]').count()).toBe(1)
  const activeVideo = page.locator('.idle-nurse-visual video[data-active="true"]')
  const firstTime = await activeVideo.evaluate((video: HTMLVideoElement) => video.currentTime)
  await page.waitForTimeout(300)
  expect(await activeVideo.evaluate((video: HTMLVideoElement, time) => !video.paused && video.currentTime > time, firstTime)).toBe(true)
  await page.screenshot({ path: 'test-results/nurse-station-pressure-iphone-se.png', fullPage: true })

  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    await expect(page.getByRole('button', { name: '摘要生成' })).toBeVisible()
  }
  expect(errors).toEqual([])
})
