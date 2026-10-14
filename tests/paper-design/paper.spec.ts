import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { TokenService } from '../../server/auth/token-service.mjs'

const accountId = 'design-quality-account'
const memberId = 'design-quality-member'
const token = new TokenService('design-quality-e2e-secret', 60 * 60_000).create({ id: accountId })
const phase = 'paper'
const evidenceRoot = path.resolve(`.codex-tmp/paper-evidence/${phase}`)
let eventId = ''

async function preparePage(page: Page) {
  await page.addInitScript(({ authToken, account, member }) => {
    sessionStorage.setItem('hoooho-auth-token', authToken)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: {
      authUser: { id: account }, opsAuthUser: null,
      currentMemberId: member, members: [], profile: null
    }, version: 5 }))
  }, { authToken: token, account: accountId, member: memberId })
}

test.beforeAll(async ({ request }) => {
  const created = await request.post('/api/events', {
    headers: { Authorization: `Bearer ${token}` },
    data: { memberId, title: '连续发热观察', category: 'fever', startTime: '2026-08-29T09:20:00+08:00' }
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  eventId = (await created.json()).id
  const record = await request.post(`/api/events/${eventId}/records`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: 'symptom', content: '上午腋温 38.2℃，有轻微头痛，喝水后精神尚可。', occurredAt: '2026-08-29T10:10:00+08:00' }
  })
  expect(record.ok(), await record.text()).toBeTruthy()
  await mkdir(evidenceRoot, { recursive: true })
})

const routes = [
  { slug: 'home', path: '/nurse-station' },
  { slug: 'cases', path: '/cases' },
  { slug: 'smart-record', path: '/smart-record' },
  { slug: 'visit-summary', path: '/visit-summary' },
  { slug: 'dietary-card', path: '/dietary-card' },
  { slug: 'food-label', path: '/food-label' },
  { slug: 'medication-reminders', path: '/medication-reminders' },
  { slug: 'desensitization-tests', path: '/desensitization-tests' },
  { slug: 'quick-search', path: '/quick-search' },
  { slug: 'help', path: '/help' },
  { slug: 'about', path: '/about' },
  { slug: 'health-events', path: '/health-events' },
  { slug: 'health-event-detail', path: () => `/health-events/${eventId}` },
  { slug: 'health-profile', path: '/health-profile' },
  { slug: 'guide', path: '/guide' },
  { slug: 'feedback', path: '/feedback' },
  { slug: 'settings', path: '/settings' }
] as const

for (const route of routes) {
  test(`${route.slug} renders without overflow and records evidence`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(message.text()))
    await preparePage(page)
    const target = typeof route.path === 'function' ? route.path() : route.path
    await page.goto(target)
    await expect(page.locator('main')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    for (const header of await page.locator('.hoho-page-header, .hoho-legacy-header, .dietary-page-header, .visit-report-header').all()) {
      await expect(header).toHaveCSS('background-color', 'rgb(244, 242, 237)')
      await expect(header).toHaveCSS('backdrop-filter', 'none')
    }
    const primary = page.locator('.hoho-button[data-variant="primary"]').first()
    if (await primary.count()) {
      // The independently styled speech hold control was already ink before this palette rollback.
      const isSpeechHold = await primary.evaluate(node => node.classList.contains('quick-search-hold'))
      await expect(primary).toHaveCSS('background-color', isSpeechHold ? 'rgb(39, 51, 50)' : 'rgb(72, 98, 83)')
      await expect(primary).toHaveCSS('color', 'rgb(255, 255, 255)')
      for (const icon of await primary.locator('svg').all()) await expect(icon).toHaveCSS('color', 'rgb(255, 255, 255)')
    }
    if (route.slug === 'visit-summary') await expect(page.locator('.visit-reading')).toBeVisible()
    for (const wrapper of await page.locator('.dietary-card, .visit-report, .visit-reading-card').all()) {
      await expect(wrapper).toHaveCSS('background-color', 'rgb(244, 242, 237)')
    }
    expect(new URL(page.url()).pathname).toBe(route.slug === "guide" ? "/help" : route.slug === "health-event-detail" ? "/cases" : target)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
    await page.screenshot({ path: path.join(evidenceRoot, `${testInfo.project.name}-${route.slug}.png`), fullPage: true })
    const unexpected = runtimeErrors.filter(message => !(route.slug === 'visit-summary' && message.includes('status of 503')))
    expect(unexpected, unexpected.join('\n')).toEqual([])
  })
}

test('followup uses core titles, a real recovery marker, and event-bound full-page supplement', async ({page,request}) => {
  await preparePage(page)
  const headers={Authorization:`Bearer ${token}`}
  const created=await request.post('/api/events',{headers,data:{memberId,title:'颈部伴有红肿和瘙痒，夜间很明显',category:'other',startTime:'2026-10-01T08:00:00Z'}})
  expect(created.ok()).toBeTruthy()
  const ownId=(await created.json()).id
  const recorded=await request.post(`/api/events/${ownId}/records`,{headers,data:{type:'symptom',content:'颈部伴有红肿和瘙痒，夜间很明显',occurredAt:'2026-10-01T08:00:00Z'}})
  expect(recorded.ok()).toBeTruthy()
  await page.goto(`/health-events/${ownId}`)
  await expect(page).toHaveURL(/\/cases\?eventId=/)
  await expect(page.getByRole('heading',{name:'症状跟进',exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:'症状跟踪',exact:true})).toHaveCount(0)
  const card=()=>page.locator(`[data-case-id="${ownId}"]`)
  await expect(card().getByRole('heading',{name:'颈部红肿、瘙痒',exact:true})).toBeVisible()
  await expect(card().locator('.case-followup-supplement')).toHaveCount(0)
  await expect(card().getByText('颈部伴有红肿和瘙痒，夜间很明显',{exact:true})).toHaveCount(0)
  await card().getByRole('button',{name:'展开',exact:true}).click()
  await expect(card().getByText('颈部伴有红肿和瘙痒，夜间很明显',{exact:true})).toBeVisible()
  await card().getByRole('button',{name:'补充情况',exact:true}).click()
  await expect(page).toHaveURL(new RegExp(`/smart-record\\?source=case-followup&eventId=${ownId}`))
  await expect(page.getByRole('heading',{name:'智能记录',exact:true})).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.hoho-bottom-sheet-layer')).toHaveCount(0)
  let target=''
  await page.route('**/api/members/*/ai-drafts',async route=>{target=route.request().postDataJSON().eventId;await route.abort('failed')})
  await page.getByRole('button',{name:'改用文字',exact:true}).click()
  await page.getByLabel('对话输入').fill('合成补充：颈部仍然发痒')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect.poll(()=>target).toBe(ownId)
  await expect(page.getByRole('alert')).toBeVisible()
  page.on('dialog',dialog=>void dialog.accept())
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await expect(page).toHaveURL(/\/cases\?eventId=/)
  await card().getByRole('button',{name:'补充情况',exact:true}).click()
  await expect(page.getByText('合成补充：颈部仍然发痒',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await card().getByRole('button',{name:'已康复',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('已标记康复并归档')
  const result=await request.get(`/api/events/${ownId}`,{headers})
  const recovered=await result.json()
  expect(recovered.status).toBe('recovered');expect(recovered.caseArchiveReason).toBe('user_recovered');expect(recovered.caseRecoveryMarkedAt).toBeTruthy()
  await page.getByRole('tab',{name:/已归档/}).click()
  await expect(card().getByRole('button',{name:'恢复跟进',exact:true})).toBeVisible()
  await card().getByRole('button',{name:'恢复跟进',exact:true}).click()
})


test('sidebar retains side drawer and expandable groups', async ({ page }) => {
  await preparePage(page)
  await page.goto('/nurse-station')
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.hoho-drawer')).toHaveCSS('background-color', 'rgb(252, 251, 247)')
  const group = drawer.locator('button[aria-expanded]').first()
  const before = await group.getAttribute('aria-expanded')
  await group.click()
  await expect(group).toHaveAttribute('aria-expanded', before === 'true' ? 'false' : 'true')
  await page.screenshot({path: path.join(evidenceRoot, 'sidebar.png')})
  await drawer.getByRole('button', { name: '关闭菜单', exact: true }).click()
  await expect(drawer).toBeHidden()
})

test('recording feedback follows real stream amplitude and releases microphone', async ({ page }) => {
  await preparePage(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), output = context.createMediaStreamDestination()
      gain.gain.value = 0
      oscillator.connect(gain); gain.connect(output); oscillator.start(); await context.resume()
      ;(window as any).paperAudio = { context, gain, stream: output.stream }
      return output.stream
    } })
  })
  await page.goto('/smart-record')
  const hold = page.getByRole('button', { name: '按住说话' })
  await expect(hold).toBeEnabled()
  const box = (await hold.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.locator('.hoho-dialogue-recording')).toBeVisible()
  await expect.poll(() => page.locator('.hoho-dialogue-recording-wave span').nth(2).evaluate(node => parseFloat((node as HTMLElement).style.height))).toBeLessThan(5)
  await page.evaluate(() => (window as any).paperAudio.gain.gain.value = .2)
  await expect.poll(() => page.locator('.hoho-dialogue-recording-wave span').nth(2).evaluate(node => parseFloat((node as HTMLElement).style.height))).toBeGreaterThan(10)
  await page.evaluate(() => (window as any).paperAudio.gain.gain.value = 0)
  await expect.poll(() => page.locator('.hoho-dialogue-recording-wave span').nth(2).evaluate(node => parseFloat((node as HTMLElement).style.height))).toBeLessThan(5)
  await page.mouse.up()
  await expect(page.locator('.hoho-dialogue-recording')).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as any).paperAudio.stream.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBeTruthy()
  await page.evaluate(() => (window as any).paperAudio.context.close())
})

test('medication editor keeps paper material and existing close behavior', async ({ page }, info) => {
  await preparePage(page)
  await page.goto('/medication-reminders')
  await page.getByRole('button', {name:'新增提醒',exact:true}).click()
  const editor = page.getByRole('dialog',{name:'新增用药提醒'})
  await expect(editor).toBeVisible()
  await expect(editor).toHaveCSS('background-color','rgb(244, 242, 237)')
  await expect(editor.locator('header')).toHaveCSS('background-color','rgb(244, 242, 237)')
  await page.screenshot({path:path.join(evidenceRoot, `${info.project.name}-medication-editor.png`)})
  await editor.getByRole('button',{name:'返回',exact:true}).click()
  await expect(editor).toBeHidden()
})

test('home uses aligned calendar controls and up to three static core descriptions', async ({ page }, info) => {
  await preparePage(page)
  let count = 1
  await page.route('**/api/members/*/cases?*', async route => {
    const response = await route.fetch()
    const data = await response.json()
    const base = data.active.find((item: any) => item.followup.hasSymptom)
    expect(base).toBeTruthy()
    await route.fulfill({ response, json: { ...data, active: Array.from({length:count}, (_, index) => ({ ...base, event: {...base.event, id: `${base.event.id}-${index}`}, followup: {...base.followup, title: index ? base.followup.title : '连续发热观察及较长的症状标题用于验证单行布局', keyword:'发热'} })) } })
  })
  for (count of [0, 1, 2, 4]) {
    await page.goto('/nurse-station')
    const symptom = page.getByRole('region', {name:'健康事件'})
    await expect(symptom.locator('.home-followup-count')).toHaveText(`${count} 项`)
    await expect(page.locator('.home-followup-paper')).toHaveAttribute('data-paper-layers', '1')
    const card = page.locator('.nurse-home-dialogue')
    const row = card.locator('.record-entry-grid')
    const smart = card.getByRole('button',{name:'智能记录',exact:true})
    await expect(row.getByRole('button')).toHaveText(['记录症状','喂养/饮食','日常','用药','就诊资料'])
    await expect(row.locator('svg,img')).toHaveCount(0)
    const geometry = await page.evaluate(() => {
      const card = document.querySelector('.nurse-home-dialogue')!
      const row = card.querySelector('.record-entry-grid')!.getBoundingClientRect()
      const smart = card.querySelector('.record-symptom-action')!.getBoundingClientRect()
      const buttons = [...card.querySelectorAll('.record-entry-grid button')]
      const symptom = document.querySelector('.home-symptom-followup')!.getBoundingClientRect()
      return { left:Math.abs(row.left-smart.left),right:Math.abs(row.right-smart.right),height:smart.height, sameRow:buttons.every(b=>Math.abs(b.getBoundingClientRect().top-row.top)<1), labelsFit:buttons.every(b=>b.scrollWidth<=b.clientWidth), ordered:symptom.bottom<card.getBoundingClientRect().top,overflow:document.documentElement.scrollWidth>innerWidth }
    })
    expect(geometry).toMatchObject({sameRow:true,labelsFit:true,ordered:true,overflow:false})
    expect(geometry.left).toBeLessThan(1);expect(geometry.right).toBeLessThan(1);expect(geometry.height).toBeGreaterThanOrEqual(44)
    await expect(symptom.getByRole('button',{name:'情况单',exact:true})).toHaveAttribute('data-variant','primary')
    await expect(symptom.getByRole('button',{name:'症状跟进',exact:true})).toHaveAttribute('data-variant','primary')
    if (count) {
      await expect(symptom.locator('.home-symptom-description')).toHaveCount(0)
      await expect(symptom.locator('.home-event-descriptions li')).toHaveCount(Math.min(3,count))
      await expect(symptom.locator('.home-symptom-dates,.home-symptom-keyword,.home-followup-preview')).toHaveCount(0)
      await expect(symptom.locator('.home-event-descriptions button,.home-event-descriptions a')).toHaveCount(0)
    }
    if(count===2) await page.screenshot({path:path.join(evidenceRoot, `${info.project.name}-home-stacked.png`),fullPage:true})
    await expect(page.getByLabel('准备和医生说清楚',{exact:true})).toHaveCount(0)
    await expect(smart).toBeEnabled()
  }
})

test('home record entries open the existing forms and preserve main destinations', async ({page}) => {
  await preparePage(page)
  for(const [entry, title] of [['记录症状','记录症状'],['喂养/饮食','喂养/饮食'],['用药','记录用药'],['就诊资料','记录就医'],['睡眠','记录睡眠'],['排便','记录排便'],['身体涂抹','记录身体涂抹']]) {
    await page.goto('/nurse-station')
    const card = page.locator('.nurse-home-dialogue')
    await expect(card.getByRole('button',{name:'智能记录',exact:true})).toBeEnabled()
    if(['睡眠','排便','身体涂抹'].includes(entry)) {
      await card.getByRole('button',{name:'日常',exact:true}).click()
      await expect(card.getByRole('group',{name:'记录日常选项'})).toBeVisible()
    }
    await card.getByRole('button',{name:entry,exact:true}).click()
    await expect(page.getByRole('dialog',{name:title,exact:true})).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/health-events')
    await page.getByRole('dialog',{name:title,exact:true}).getByRole('button',{name:/返回/,exact:true}).click()
    await expect(page.getByRole('dialog',{name:title,exact:true})).toBeHidden()
  }
  for(const [label, target] of [['智能记录','/smart-record'],['症状跟进','/cases'],['情况单','/visit-summary']]) {
    await page.goto('/nurse-station')
    await page.getByRole('button',{name:label,exact:true}).click()
    await expect.poll(()=>new URL(page.url()).pathname).toBe(target)
    if(target==='/cases'){
      await expect(page.getByRole('heading',{name:'症状跟进',exact:true})).toBeVisible()
      await page.locator('header').getByRole('button',{name:'返回',exact:true}).click()
      await expect.poll(()=>new URL(page.url()).pathname).toBe('/nurse-station')
    }
  }
})

test('SE home preserves approved proportions and keeps the smart action accessible', async ({page}, info) => {
  await page.setViewportSize({width:375,height:667})
  await preparePage(page)
  await page.route('**/api/members/*/cases?*', async route => {
    const response=await route.fetch(),data=await response.json()
    const base=data.active.find((item:any)=>item.followup.hasSymptom)
    expect(base).toBeTruthy()
    await route.fulfill({response,json:{...data,active:Array.from({length:4},(_,index)=>({...base,event:{...base.event,id:`${base.event.id}-${index}`},followup:{...base.followup,title:'连续发热观察及较长的症状标题用于验证单行布局',keyword:'发热'}}))}})
  })
  await page.goto('/nurse-station')
  await expect(page.locator('.home-followup-count')).toHaveText('4 项')
  await expect(page.locator('.home-followup-paper')).toHaveAttribute('data-paper-layers','1')
  await page.evaluate(()=>document.fonts.ready)
  await expect(page.getByRole('button',{name:'智能记录',exact:true})).toBeInViewport({ratio:1})
  await expect(page.locator('.home-followup-actions svg')).toHaveCount(0)
  await expect(page.getByRole('region',{name:'健康事件'}).getByRole('button',{name:'症状跟进',exact:true})).toHaveCSS('background-color','rgb(72, 98, 83)')
  await expect(page.getByRole('region',{name:'健康事件'}).getByRole('button',{name:'情况单',exact:true})).toHaveCSS('color','rgb(255, 255, 255)')
  await expect(page.locator('.nurse-home-dialogue time,.home-record-time-hint')).toHaveCount(0)
  const geometry=await page.evaluate(()=>{
    const scroll=document.querySelector('.nurse-station-scroll')!,card=document.querySelector('.nurse-home-dialogue')!,heading=card.querySelector('.home-followup-heading')!.getBoundingClientRect(),visual=card.querySelector('.nurse-station-visual')!.getBoundingClientRect(),hero=document.querySelector('.nurse-station-hero')!,event=document.querySelector('.home-symptom-followup')!
    const front=event.getBoundingClientRect(),journal=card.getBoundingClientRect()
    const touches=[...document.querySelectorAll('.home-followup-actions button,.record-entry-grid button,.record-symptom-action')]
    return {scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,scrollTop:scroll.scrollTop,videoTop:visual.top,headingTop:heading.top,bottom:journal.bottom,viewport:innerHeight,minTouchHeight:Math.min(...touches.map(n=>n.getBoundingClientRect().height)),textures:[getComputedStyle(hero).backgroundImage,getComputedStyle(event).backgroundImage,getComputedStyle(event.parentElement!,'::before').backgroundImage],clip:getComputedStyle(event).clipPath,healthWhite:getComputedStyle(card).backgroundColor,frontBottom:front.bottom}
  })
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight+1)
  expect(geometry.scrollTop).toBe(0);expect(geometry.bottom).toBeLessThan(geometry.viewport)
  expect(geometry.videoTop).toBe(geometry.headingTop);expect(geometry.minTouchHeight).toBeGreaterThanOrEqual(44)
  expect(geometry.textures.every(value=>value.includes('home-paper-grain.svg'))).toBeTruthy()
  expect(geometry.clip).toContain('polygon');expect(geometry.healthWhite).toBe('rgb(255, 255, 255)')
  await page.screenshot({path:path.join(evidenceRoot,`${info.project.name}-se-restored-proportions.png`)})
  const proportions=await page.locator('.hoho-main-header,.nurse-station-hero--compact,.home-symptom-followup').evaluateAll(nodes=>nodes.map(node=>({height:node.getBoundingClientRect().height,padding:getComputedStyle(node).padding})))
  expect(proportions[0].height).toBe(64)
  await page.setViewportSize({width:375,height:548})
  expect(await page.locator('.hoho-main-header,.nurse-station-hero--compact,.home-symptom-followup').evaluateAll(nodes=>nodes.map(node=>({height:node.getBoundingClientRect().height,padding:getComputedStyle(node).padding})))).toEqual(proportions)
  await page.locator('.nurse-station-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight})
  await expect(page.getByRole('button',{name:'智能记录',exact:true})).toBeInViewport({ratio:1})
  await page.screenshot({path:path.join(evidenceRoot,`${info.project.name}-se-short-viewport-scroll.png`)})
})
