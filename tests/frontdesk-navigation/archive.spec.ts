import { expect, test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }
let memberId: string

test.beforeEach(async ({ page, request }) => {
  const response = await request.post('/api/members', { headers, data: { name: '合成宝宝', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(response.ok()).toBe(true)
  memberId = (await response.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/health-profile')
  await expect(page.getByRole('navigation', { name: '档案分类' })).toBeVisible()
})

test('grouped archive has a leading child identity, no upload entry and unobscured rows at every supported width', async ({ page }, info) => {
  const header = page.locator('.hoho-main-header')
  await expect(header.getByRole('button', { name: '切换记录对象' })).toContainText('合**宝')
  await expect(page.getByRole('button', { name: '上传资料', exact: true })).toHaveCount(0)
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await expect(header.getByRole('button')).toHaveCount(2)
  await expect(page.getByRole('button',{name:'生长记录',exact:true}).locator('svg').first()).toHaveAttribute('data-icon','trending_up')
  for(const card of await page.locator('.health-profile-entries').all())expect(await card.evaluate(node=>getComputedStyle(node).boxShadow)).not.toBe('none')
  await expect(page.getByRole('navigation', { name: '档案分类' }).getByRole('heading')).toHaveText(['基本资料', '健康史', '儿童保健'])
  await expect(page.getByRole('region', { name: '基本资料', exact: true }).getByRole('button')).toHaveText(['身份与出生背景', '生长记录'])
  await expect(page.getByRole('region', { name: '健康史', exact: true }).getByRole('button')).toHaveText(['过敏史未记录', '慢性病史未记录', '家族史未记录', '手术史未记录'])
  await expect(page.getByRole('region', { name: '儿童保健', exact: true }).getByRole('button')).toHaveText(['儿保与筛查', '疫苗接种记录未记录'])
  expect(await header.getByRole('heading').evaluate(element => element.getBoundingClientRect().width)).toBe(1)
  await expect(page.locator('.health-profile-home .health-record-subject-header')).toHaveCount(0)
  for (const width of [320, 375, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 })
    const layout = await header.evaluate(element => {
      const menu = element.querySelector('[aria-label="打开菜单"]')!.getBoundingClientRect()
      const subject = element.querySelector('[aria-label="切换记录对象"]')!.getBoundingClientRect()

      return { fits: document.documentElement.scrollWidth <= innerWidth, menuRight: menu.right, subjectLeft: subject.left, subjectRight: subject.right,  headerRight: element.getBoundingClientRect().right }
    })
    expect(layout.fits).toBe(true)
    expect(layout.menuRight).toBeLessThanOrEqual(layout.subjectLeft)
    expect(layout.subjectRight).toBeLessThanOrEqual(layout.headerRight)
    await page.getByRole('button', { name: /^疫苗接种记录/ }).evaluate(element => element.scrollIntoView({ block: 'center' }))
    const last = await page.getByRole('button', { name: /^疫苗接种记录/ }).boundingBox()
    const bottom = await page.getByRole('navigation', { name: '主要导航' }).boundingBox()
    expect(last!.y + last!.height).toBeLessThanOrEqual(bottom!.y)
    await page.screenshot({ path: info.outputPath(`archive-${width}.png`), fullPage: true })
  }
})

test('each of the eight entries opens its existing archive and returns to the grouped directory', async ({ page }) => {
  for (const [label, route] of [
    ['身份与出生背景', 'identity'], ['生长记录', 'basic'], ['过敏史', 'allergy'], ['慢性病史', 'chronic'],
    ['家族史', 'family-history'], ['手术史', 'surgery'], ['儿保与筛查', 'checkups'], ['疫苗接种记录', 'vaccination']
  ]) {
    await page.getByRole('navigation', { name: '档案分类' }).getByRole('button', { name: new RegExp(`^${label}`) }).click()
    await expect(page).toHaveURL(new RegExp(`/health-profile/${route}$`))
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await expect(page.getByRole('navigation', { name: '档案分类' })).toBeVisible()
  }
})

test('switching children updates the header and counts; installation UI is absent from every top level page', async ({ page, request }) => {
  const recorded = await request.post(`/api/members/${memberId}/profile-list/surgery`, { headers, data: { key: crypto.randomUUID(), action: 'add', name: '合成手术记录', group: '' } })
  expect(recorded.ok()).toBe(true)
  await page.reload()
  await expect(page.getByRole('region', { name: '健康史' }).getByRole('button', { name: /^手术史/ })).toContainText('1条')
  const added = await request.post('/api/members', { headers, data: { name: '小安', relationship: 'child', birthday: '2025-10-01', gender: 'male' } })
  expect(added.ok()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: '切换记录对象', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '我的孩子', exact: true })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: '切换到*安' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.locator('.hoho-main-header__child')).toContainText('*安')
  await expect(page.locator('.hoho-main-header__child')).not.toContainText('岁')
  await expect(page.locator('.hoho-main-header__child [data-icon=expand_more]')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '健康史', exact: true }).getByRole('button')).toHaveText(['过敏史未记录', '慢性病史未记录', '家族史未记录', '手术史未记录'])
  const identity=await page.locator('.hoho-main-header__child').innerText()
  for (const path of ['/health-profile', '/health-events', '/nurse-station']) {
    await page.getByRole('navigation',{name:'主要导航'}).getByRole('button',{name:path==='/health-profile'?'档案':path==='/health-events'?'健康日历':'症状记录',exact:true}).click()
    await expect.poll(()=>new URL(page.url()).pathname).toBe(path)
    if(path==='/health-events')await expect(page.getByRole('heading',{name:'健康日历',exact:true})).toBeVisible()
    if(path==='/nurse-station'){
      await expect(page.getByRole('button',{name:'按住记录症状',exact:true})).toBeEnabled()
      await expect(page.locator('.hoho-main-header__child')).toHaveText(identity)
      await expect(page.getByRole('button',{name:'添加照片、视频或文件',exact:true})).toBeEnabled()
      await expect(page.getByLabel('选择附件文件', { exact: true })).toHaveCount(1)
    }
    await expect(page.getByRole('button', { name: /添加.*主屏/ })).toHaveCount(0)
    await expect(page.locator('.install-app-trigger, .install-guide-layer, .install-app-notice')).toHaveCount(0)
  }
})

test('basic overview shows saved values and dates, clears on child switch and recovers failed growth reads', async ({ page, request }) => {
  expect((await request.patch(`/api/members/${memberId}`, { headers, data: { bloodType: 'AB', rhBloodType: 'negative' } })).ok()).toBe(true)
  for (const values of [{ measuredAt: '2026-09-10', heightCm: 88.2, weightKg: null }, { measuredAt: '2026-09-11', heightCm: null, weightKg: 12.3 }]) {
    expect((await request.post('/api/growth-measurements', { headers, data: { memberId, ...values, measurementType: 'height', dataStatus: 'confirmed', standardId: 'who-2006' } })).ok()).toBe(true)
  }
  await page.reload()
  const summary = page.getByLabel('基本资料摘要', { exact: true })
  await expect(summary).toContainText('AB型')
  await expect(summary).toContainText('RhD 阴性')
  await expect(summary).toContainText('88.2cm')
  await expect(summary).toContainText('12.3kg')
  await expect(summary).toContainText('2026-09-10')
  await expect(summary).toContainText('2026-09-11')
  await expect(page.locator('.hoho-main-header__child')).toHaveText('合**宝')
  await expect(page.locator('.hoho-main-header__child [data-icon]')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '档案', exact: true })).toHaveAttribute('aria-current', 'page')
  expect(await summary.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual((await page.getByRole('button', { name: '身份与出生背景', exact: true }).boundingBox())!.y)

  await page.route('**/api/growth-measurements?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '合成读取失败' } }) }))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('身高、体重读取失败')
  await expect(summary).toContainText('暂不可用')
  await expect(summary).not.toContainText('88.2')
  await page.unroute('**/api/growth-measurements?**')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(summary).toContainText('88.2cm')

  expect((await request.post('/api/members', { headers, data: { name: '小宁', relationship: 'child', birthday: '2025-10-01', gender: 'male' } })).ok()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: '切换记录对象', exact: true }).click()
  await page.getByRole('dialog', { name: '我的孩子', exact: true }).getByRole('button', { name: '切换到*宁' }).click()
  await expect(page.locator('.hoho-main-header__child')).toHaveText('*宁')
  await expect(summary).not.toContainText('88.2')
  await expect(summary).not.toContainText('AB型')
  await expect(summary.getByText('未填写', { exact: true })).toHaveCount(3)
})
