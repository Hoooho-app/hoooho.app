import { expect, test, type Page } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'

const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' })
const headers = { Authorization: `Bearer ${token}` }
const original = '脸上有个小痘痘，不确定是包包还什么'
let memberId: string, contextId: string
async function seedDeviceDraft(page:Page,memberId:string,draft:Record<string,unknown>){
  await page.evaluate(async({memberId,draft})=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('hoooho-smart-record-drafts',1);open.onupgradeneeded=()=>open.result.createObjectStore('drafts');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(draft,`home-smart:visit-test:${memberId}:new`);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}})},{memberId,draft})
}
test.beforeEach(async ({ page, request }) => {
  const created = await request.post('/api/members', { headers, data: { name: '合成宝宝', relationship: 'child', birthday: '2024-10-01', gender: 'female' } })
  expect(created.ok()).toBe(true); memberId = (await created.json()).id
  const context = await request.post(`/api/members/${memberId}/front-desk-record`, { headers, data: { kind: 'legacy', requestId: crypto.randomUUID(), updatedAt: Date.now(), turns: [{ id: crypto.randomUUID(), role: 'user', text: original, at: Date.now() }], files: [], voiceFiles: [] } })
  expect(context.ok()).toBe(true); contextId = (await context.json()).id
  await page.addInitScript(({ token, memberId }) => {
    sessionStorage.setItem('hoooho-auth-token', token)
    localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: memberId, members: [], profile: null }, version: 5 }))
  }, { token, memberId })
  await page.goto('/health-profile')
  await expect(page.getByRole('navigation', { name: '档案分类' })).toBeVisible()
})

test('sidebar uses a distinct new-conversation icon and actual source keywords; opening and returning keep the original', async ({ page }, info) => {
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  let drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await expect(drawer.getByRole('button', { name: '新建对话', exact: true }).locator('svg')).toHaveAttribute('data-icon', 'add_comment')
  await expect(drawer.getByRole('button', { name: '我的账户', exact: true }).locator('svg').last()).toHaveAttribute('data-icon', 'chevron_right')
  await expect(drawer.getByRole('button', { name: /^脸上.*小痘痘.*待确认/ })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '查看全部对话' })).toHaveCount(0)
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 667 })
    expect(await drawer.locator('.hoho-drawer').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await expect(drawer.getByRole('button', { name: '反馈', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`history-${width}.png`), fullPage: true })
  }
  await drawer.getByRole('button', { name: /^脸上.*小痘痘/ }).click()
  await expect(page).toHaveURL(new RegExp(`/conversation-history/${contextId}\\?from=sidebar$`))
  await expect(page.getByText(original, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/health-profile$/)
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await drawer.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page).toHaveURL(/\/nurse-station$/)
  await expect(page.getByRole('button', { name: '按住记录症状', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '侧边栏菜单' }).getByRole('button', { name: /^脸上.*小痘痘/ })).toBeVisible()
})

test('more than 30 histories stay in the sidebar; a failed page retries without losing or duplicating the earlier rows', async ({ page, request }) => {
  const actual = (await (await request.get(`/api/members/${memberId}/front-desk-record/history`, { headers })).json()).items[0]
  const rows = Array.from({ length: 32 }, (_, index) => ({ ...actual, id: 'history-' + index, title: '对话关键词' + index, updatedAt: new Date(Date.now() - index * 1000).toISOString() }))
  let attempts = 0
  await page.route('**/front-desk-record/history*', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
    if (offset && ++attempts === 1) { await route.fulfill({ status: 503, json: { error: { message: '合成分页失败' } } }); return }
    await route.fulfill({ json: { items: rows.slice(offset, offset + 30), hasMore: offset === 0, nextOffset: offset + 30 } })
  })
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '侧边栏菜单' }), items = drawer.locator('.drawer-history-open')
  await expect(items).toHaveCount(30)
  await drawer.getByRole('navigation', { name: '对话记录' }).evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect(drawer.getByText('更早对话暂未加载，已显示的对话仍保留。')).toBeVisible()
  await expect(items).toHaveCount(30)
  await drawer.getByRole('button', { name: '重试', exact: true }).click()
  await expect(items).toHaveCount(32)
  expect(await items.last().innerText()).toContain('对话关键词31')
  await drawer.getByRole('navigation', { name: '对话记录' }).evaluate(node => { node.scrollTop = node.scrollHeight })
  expect(attempts).toBe(2)
  await expect(drawer.getByRole('button', { name: '查看全部对话' })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '新建对话', exact: true })).toBeVisible()
})

test('closing the sidebar cancels a delayed page so it cannot populate a reopened history', async ({ page, request }) => {
  const actual = (await (await request.get(`/api/members/${memberId}/front-desk-record/history`, { headers })).json()).items[0]
  let generation = 0, finish: (() => void) | undefined
  await page.route('**/front-desk-record/history*', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
    if (offset) {
      await new Promise<void>(resolve => { finish = resolve })
      await route.fulfill({ json: { items: [{ ...actual, id: 'late', title: '迟到的旧对话' }], hasMore: false, nextOffset: 60 } }).catch(() => undefined)
    } else {
      generation++
      await route.fulfill({ json: { items: generation === 1 ? Array.from({ length: 30 }, (_, n) => ({ ...actual, id: 'first-' + n })) : [{ ...actual, title: '重新打开后的对话' }], hasMore: generation === 1, nextOffset: 30 } })
    }
  })
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  let drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await expect(drawer.locator('.drawer-history-open')).toHaveCount(30)
  await drawer.getByRole('navigation', { name: '对话记录' }).evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect.poll(() => Boolean(finish)).toBe(true)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  drawer = page.getByRole('dialog', { name: '侧边栏菜单' })
  await expect(drawer.getByRole('button', { name: /^重新打开后的对话/ })).toBeVisible()
  finish!()
  await expect(drawer.locator('.drawer-history-open')).toHaveCount(1)
  await expect(drawer.getByRole('button', { name: /^迟到的旧对话/ })).toHaveCount(0)
})

test('a tall sidebar automatically loads the next page when the first 30 rows do not fill it', async ({ page, request }) => {
  const actual = (await (await request.get(`/api/members/${memberId}/front-desk-record/history`, { headers })).json()).items[0]
  await page.setViewportSize({ width: 1280, height: 2400 })
  await page.route('**/front-desk-record/history*', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
    await route.fulfill({ json: { items: Array.from({ length: offset ? 1 : 30 }, (_, n) => ({ ...actual, id: 'tall-' + (n + offset), title: '历史主题' + (n + offset) })), hasMore: !offset, nextOffset: offset + 30 } })
  })
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '侧边栏菜单' }).locator('.drawer-history-open')).toHaveCount(31)
})


test('single-line green keywords and yellow pending text leave a 44px delete target on every mobile width',async({page},info)=>{
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  const row=page.locator('.drawer-history-row').first()
  for(const width of [320,375,390,430]){
    await page.setViewportSize({width,height:667})
    const layout=await row.evaluate(node=>{const title=node.querySelector('.drawer-history-title')!,button=node.querySelector('.drawer-history-delete')!,pending=node.querySelector('.drawer-history-pending')!;const rect=title.getBoundingClientRect();return {whiteSpace:getComputedStyle(title).whiteSpace,titleHeight:rect.height,lineHeight:parseFloat(getComputedStyle(title).lineHeight),recordColor:getComputedStyle(title).color,pendingColor:getComputedStyle(pending).color,deleteWidth:button.getBoundingClientRect().width,deleteHeight:button.getBoundingClientRect().height,fits:node.scrollWidth<=node.clientWidth}})
    expect(layout.whiteSpace).toBe('nowrap');expect(layout.titleHeight).toBeLessThanOrEqual(layout.lineHeight+1);expect(layout.fits).toBe(true)
    expect(layout.recordColor).toBe('rgb(42, 120, 82)');expect(layout.pendingColor).toBe('rgb(166, 105, 34)')
    expect(layout.deleteWidth).toBeGreaterThanOrEqual(44);expect(layout.deleteHeight).toBeGreaterThanOrEqual(44)
    await page.screenshot({path:info.outputPath(`compact-${width}.png`)})
  }
})

test('bottom deletion confirmation cancels without a write, preserves a failed row for retry, then removes it across reload and old links',async({page,request},info)=>{
  const endpoint=`/api/members/${memberId}/front-desk-record/contexts/${contextId}`
  let writes=0
  await page.route('**/front-desk-record/contexts/**',async route=>{
    if(route.request().method()!=='DELETE'){await route.continue();return}
    writes++;if(writes===1){await route.fulfill({status:503,json:{error:{message:'合成删除失败，请重试'}}});return}await route.continue()
  })
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  const drawer=page.getByRole('dialog',{name:'侧边栏菜单'})
  await drawer.getByRole('button',{name:/^删除对话/}).click()
  const sheet=page.getByRole('dialog',{name:'删除对话',exact:true})
  await expect(sheet.getByText('删除对话不会影响已保存的记录。')).toBeVisible()
  const box=await sheet.boundingBox();expect(box!.y).toBeGreaterThan(0)
  await page.screenshot({path:info.outputPath('delete-confirmation.png')})
  await sheet.getByRole('button',{name:'取消',exact:true}).click();expect(writes).toBe(0)
  await expect(drawer.locator('.drawer-history-open')).toHaveCount(1)
  await drawer.getByRole('button',{name:/^删除对话/}).click()
  await sheet.getByRole('button',{name:'确认删除',exact:true}).click()
  await expect(sheet.getByRole('alert')).toContainText('合成删除失败')
  await expect(drawer.locator('.drawer-history-open')).toHaveCount(1)
  await sheet.getByRole('button',{name:'确认删除',exact:true}).click()
  await expect(sheet).toBeHidden();await expect(drawer.locator('.drawer-history-open')).toHaveCount(0)
  expect((await (await request.get(endpoint,{headers})).json())).toBeNull()
  await page.reload();await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await expect(drawer.locator('.drawer-history-open')).toHaveCount(0)
  await page.goto(`/conversation-history/${contextId}?from=sidebar`)
  await expect(page.getByText('未找到这次对话。',{exact:true})).toBeVisible()
  expect(writes).toBe(2)
})

test('deleting the active conversation clears its device copies and a stale device copy cannot recreate it',async({page,request})=>{
  await request.post(`/api/members/${memberId}/front-desk-record`,{headers,data:{kind:'legacy',requestId:crypto.randomUUID(),updatedAt:Date.now()-100000,turns:[{text:'之前肚子痛'}],files:[],voiceFiles:[]}})
  await page.goto('/nurse-station')
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await page.locator('.drawer-history-open').first().click()
  await page.getByRole('button',{name:'继续此对话',exact:true}).click()
  await expect(page.getByRole('region',{name:'智能记录'})).toBeVisible()
  await expect(page.getByText(original,{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await page.getByRole('button',{name:/^删除对话：脸上/}).click()
  await page.getByRole('dialog',{name:'删除对话',exact:true}).getByRole('button',{name:'确认删除',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'删除对话',exact:true})).toBeHidden()
  await expect(page.locator('.drawer-history-open')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByText(original,{exact:true})).toHaveCount(0)
  await expect(page.getByText('之前肚子痛',{exact:true})).toHaveCount(0)
  await seedDeviceDraft(page,memberId,{frontContextId:contextId,requestId:'stale-late-write',text:'旧内容',files:[],occurredAt:'',timeUnknown:true})
  await page.reload()
  await expect(page.getByText(original,{exact:true})).toHaveCount(0)
  await expect(page.getByText('之前肚子痛',{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await expect(page.locator('.drawer-history-open')).toHaveCount(1)
})


test('a device-only draft can be deleted without touching a different server conversation',async({page,request})=>{
  await seedDeviceDraft(page,memberId,{requestId:'device-only',text:'头皮发痒',files:[],occurredAt:'',timeUnknown:true})
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await expect(page.locator('.drawer-history-open')).toHaveCount(2)
  await page.getByRole('button',{name:/^删除对话：发痒/}).click()
  await page.getByRole('dialog',{name:'删除对话',exact:true}).getByRole('button',{name:'确认删除',exact:true}).click()
  await expect(page.locator('.drawer-history-open')).toHaveCount(1)
  expect((await (await request.get(`/api/members/${memberId}/front-desk-record/history`,{headers})).json()).items).toHaveLength(1)
  await page.reload();await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await expect(page.locator('.drawer-history-open')).toHaveCount(1)
})

test('deleting a loaded row refreshes pagination so no earlier conversation is skipped',async({page})=>{
  let rows=Array.from({length:32},(_,i)=>({id:'paged-'+i,contextIds:['paged-'+i],title:'主题'+i,updatedAt:new Date(Date.now()-i*1000).toISOString()}))
  await page.route('**/front-desk-record/history*',route=>{const offset=Number(new URL(route.request().url()).searchParams.get('offset')||0);return route.fulfill({json:{items:rows.slice(offset,offset+30),hasMore:rows.length>offset+30,nextOffset:offset+30}})})
  await page.route('**/front-desk-record/contexts/paged-0',async route=>{rows=rows.filter(row=>row.id!=='paged-0');await route.fulfill({json:{deleted:true,contextIds:['paged-0']}})})
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await expect(page.locator('.drawer-history-open')).toHaveCount(30)
  await page.getByRole('button',{name:'删除对话：主题0',exact:true}).click()
  await page.getByRole('dialog',{name:'删除对话',exact:true}).getByRole('button',{name:'确认删除',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'删除对话',exact:true})).toBeHidden()
  await expect(page.locator('.drawer-history-open').filter({hasText:/^主题30$/})).toHaveCount(1)
  await expect(page.locator('.drawer-history-open')).toHaveCount(30)
  await page.getByRole('navigation',{name:'对话记录',exact:true}).evaluate(node=>{node.scrollTop=node.scrollHeight})
  await expect(page.locator('.drawer-history-open')).toHaveCount(31)
  expect(await page.locator('.drawer-history-open').allTextContents()).toEqual(rows.map(row=>row.title))
})
