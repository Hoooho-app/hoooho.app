import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }
let memberId: string

async function switchChild(page: Page, maskedName: string) {
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  await page.getByRole('dialog', { name: '侧边栏菜单' }).getByRole('button', { name: '切换记录对象', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '我的孩子', exact: true })
  await sheet.getByRole('button', { name: `切换到${maskedName}`, exact: true }).click()
  await expect(sheet).toBeHidden()
}

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
  const card = page.getByRole('region', { name: '合成宝宝', exact: true })
  await expect(card).toContainText('合成宝宝')
  await expect(card).toContainText(/女 · .*岁/)
  await expect(card.getByRole('img', { name: /合成宝宝的.*头像/ })).toBeVisible()
  await expect(card.getByText(/孩子的个人信息|切换孩子|血压|脉搏/)).toHaveCount(0)
  await expect(card.getByRole('button', { name: '切换记录对象' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '上传资料', exact: true })).toHaveCount(0)
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await expect(header.getByRole('button', { name: '打开菜单' })).toBeVisible()
  await expect(page.getByRole('button',{name:'生长记录',exact:true}).locator('svg').first()).toHaveAttribute('data-icon','trending_up')
  for(const card of await page.locator('.health-profile-entries').all())expect(await card.evaluate(node=>getComputedStyle(node).boxShadow)).not.toBe('none')
  await expect(page.getByRole('navigation', { name: '档案分类' }).getByRole('heading')).toHaveText(['基本资料', '健康史', '儿童保健'])
  await expect(page.getByRole('region', { name: '基本资料', exact: true }).getByRole('button')).toHaveText(['身份与出生背景', '生长记录'])
  await expect(page.getByRole('region', { name: '健康史', exact: true }).getByRole('button')).toHaveText(['过敏史未记录', '慢性病史未记录', '家族史未记录', '手术史未记录'])
  await expect(page.getByRole('region', { name: '儿童保健', exact: true }).getByRole('button')).toHaveText(['儿保与筛查', '疫苗接种记录未记录'])
  await expect(header.getByRole('heading', { name: '健康档案', exact: true })).toBeVisible()
  await expect(page.locator('.health-profile-home .health-record-subject-header')).toHaveCount(0)
  for (const width of [320, 375, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 })
    const layout = await card.evaluate(element => {
      const metrics = Array.from(element.querySelectorAll('.child-personal-card__metric'), metric => {
        const bounds = metric.getBoundingClientRect()
        return { text: metric.querySelector('.child-personal-card__label')?.textContent, top: bounds.top, width: bounds.width, height: bounds.height }
      })
      return { fits: document.documentElement.scrollWidth <= innerWidth, metrics }
    })
    expect(layout.fits).toBe(true)
    expect(layout.metrics.map(metric => metric.text)).toEqual(['身高', '体重', '血型'])
    expect(new Set(layout.metrics.map(metric => metric.top)).size).toBe(1)
    expect(layout.metrics.every(metric => metric.width >= 44 && metric.height >= 44)).toBe(true)
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

test('switching children updates the personal card and counts; installation UI is absent from every top level page', async ({ page, request }) => {
  const recorded = await request.post(`/api/members/${memberId}/profile-list/surgery`, { headers, data: { key: crypto.randomUUID(), action: 'add', name: '合成手术记录', group: '' } })
  expect(recorded.ok()).toBe(true)
  await page.reload()
  await expect(page.getByRole('region', { name: '健康史' }).getByRole('button', { name: /^手术史/ })).toContainText('1条')
  const added = await request.post('/api/members', { headers, data: { name: '小安', relationship: 'child', birthday: '2025-10-01', gender: 'male' } })
  expect(added.ok()).toBe(true)
  await page.reload()
  await switchChild(page, '*安')
  await expect(page.getByRole('region', { name: '小安', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '健康史', exact: true }).getByRole('button')).toHaveText(['过敏史未记录', '慢性病史未记录', '家族史未记录', '手术史未记录'])
  const bottom = page.getByRole('navigation', { name: '主要导航' })
  const paths = ['/health-profile', '/health-events']
  if (await bottom.locator('[data-ha-destination="/nurse-station"]').count()) paths.push('/nurse-station')
  for (const path of paths) {
    await bottom.locator(`[data-ha-destination="${path}"]`).click()
    await expect.poll(()=>new URL(page.url()).pathname).toBe(path)
    if(path==='/health-events')await expect(page.getByRole('heading',{name:'健康日历',exact:true})).toBeVisible()
    if(path==='/nurse-station'){
      await expect(page.getByRole('button',{name:'按住记录症状',exact:true})).toBeEnabled()
      await expect(page.locator('.hoho-main-header__child')).toHaveText('*安')
      await expect(page.getByRole('button',{name:'添加照片、视频或文件',exact:true})).toBeEnabled()
      await expect(page.getByLabel('选择附件文件', { exact: true })).toHaveCount(1)
    }
    await expect(page.getByRole('button', { name: /添加.*主屏/ })).toHaveCount(0)
    await expect(page.locator('.install-app-trigger, .install-guide-layer, .install-app-notice')).toHaveCount(0)
  }
})

test('basic overview shows saved values without dates, clears on child switch and recovers failed growth reads', async ({ page, request }) => {
  expect((await request.patch(`/api/members/${memberId}`, { headers, data: { bloodType: 'AB', rhBloodType: 'negative' } })).ok()).toBe(true)
  for (const values of [{ measuredAt: '2026-09-10', heightCm: 88.2, weightKg: null }, { measuredAt: '2026-09-11', heightCm: null, weightKg: 12.3 }]) {
    expect((await request.post('/api/growth-measurements', { headers, data: { memberId, ...values, measurementType: 'height', dataStatus: 'confirmed', standardId: 'who-2006' } })).ok()).toBe(true)
  }
  await page.reload()
  const summary = page.getByRole('region', { name: '合成宝宝', exact: true })
  await expect(summary.getByRole('combobox', { name: '血型', exact: true })).toHaveValue('AB')
  await expect(summary).toContainText('RhD 阴性')
  await expect(summary).toContainText('88.2cm')
  await expect(summary).toContainText('12.3kg')
  await expect(summary.getByText('BMI', { exact: true }).locator('..').locator('dd')).toHaveText('15.8')
  await expect(summary).not.toContainText(/2026-09-1[01]/)
  await expect(summary).toContainText('合成宝宝')
  await expect(page.getByRole('navigation', { name: '主要导航' }).locator('[data-ha-destination="/health-profile"]')).toHaveAttribute('aria-current', 'page')
  expect(await summary.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual((await page.getByRole('button', { name: '身份与出生背景', exact: true }).boundingBox())!.y)

  await page.route('**/api/growth-measurements?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '合成读取失败' } }) }))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('身高、体重读取失败')
  await expect(summary).toContainText('暂不可用')
  await expect(summary).not.toContainText('88.2')
  await page.unroute('**/api/growth-measurements?**')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(summary).toContainText('88.2cm')

  for (const measure of ['体重', '身高']) {
    await summary.getByRole('link', { name: new RegExp(`查看${measure}曲线`) }).click()
    await expect(page).toHaveURL(/\/health-profile\/basic$/)
    await expect(page.getByRole('heading', { name: '成长数据', exact: true })).toBeVisible()
    const tab = page.getByRole('tab', { name: `${measure}曲线`, exact: true })
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(tab).toHaveCSS('background-color', 'rgb(44, 64, 52)')
    const measurement = page.locator('.growth-data-measurement')
    await expect(measurement).toBeVisible()
    await expect(measurement.locator('time, input[type="date"]')).toHaveCount(0)
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await expect(summary).toContainText('88.2cm')
  }

  await summary.getByRole('link', { name: /查看身高曲线/ }).click()
  await page.getByRole('button', { name: '身高增加0.1厘米', exact: true }).click()
  await page.getByRole('button', { name: '保存本次更新', exact: true }).click()
  await expect(page.getByText('已保存，并加入成长记录', { exact: true })).toBeVisible()
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'))
  await expect(page.locator('.growth-data-latest')).toContainText(today)
  await expect(page.locator('.growth-data-measurement')).not.toContainText(today)
  await page.getByRole('tab', { name: '体重曲线', exact: true }).click()
  await expect(page.getByRole('tab', { name: '体重曲线', exact: true })).toHaveCSS('background-color', 'rgb(44, 64, 52)')
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(summary).toContainText('88.3cm')
  await expect(summary).not.toContainText(today)

  expect((await request.post('/api/members', { headers, data: { name: '小宁', relationship: 'child', birthday: '2025-10-01', gender: 'male' } })).ok()).toBe(true)
  await page.reload()
  await switchChild(page, '*宁')
  const next = page.getByRole('region', { name: '小宁', exact: true })
  await expect(next).not.toContainText('88.3')
  await expect(next.getByRole('combobox', { name: '血型', exact: true })).toHaveValue('')
  await expect(next.locator('.child-personal-card__empty')).toHaveText(['未填写', '未填写', '未填写'])
})

test('血型直接下拉保存，失败保留原值并可重试', async ({ page, request }) => {
  const memberUrl = `/api/members/${memberId}`
  expect((await request.patch(memberUrl, { headers, data: { bloodType: 'A', rhBloodType: 'negative' } })).ok()).toBe(true)
  await page.reload()
  const card = page.getByRole('region', { name: '合成宝宝', exact: true })
  const select = card.getByRole('combobox', { name: '血型', exact: true })
  await expect(select).toHaveValue('A')
  await expect(select.getByRole('option')).toHaveText(['未填写', 'A型', 'B型', 'O型', 'AB型'])

  const endpoint = `**${memberUrl}`
  await page.route(endpoint, route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 503, json: { error: { message: '合成保存失败' } } })
    : route.continue())
  await select.selectOption('B')
  await expect(card.getByRole('alert')).toContainText('血型未保存')
  await expect(select).toHaveValue('A')
  await page.unroute(endpoint)
  await card.getByRole('button', { name: '重试保存血型' }).click()
  await expect(select).toHaveValue('B')
  await expect(card).toContainText('RhD 阴性')
  expect(await (await request.get(memberUrl, { headers })).json()).toMatchObject({ bloodType: 'B', rhBloodType: 'negative' })

  await page.reload()
  await expect(select).toHaveValue('B')
  await select.selectOption('O')
  await expect(select).toHaveValue('O')
  await page.getByRole('button', { name: '身份与出生背景', exact: true }).click()
  await expect(page.getByRole('heading', { name: '基本资料与出生背景' })).toBeVisible()
  await expect(page.getByText('O型', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑血压与脉搏' })).toHaveCount(0)
})
