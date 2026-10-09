import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
test.beforeEach(async({page})=>{
 await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'empty-child',members:[],profile:null},version:5}))},token)
 await page.goto('/nurse-station')
})
test('四卡单列与冻结人物资料；泛记录护士弹窗支持关闭恢复',async({page})=>{
 await expect(page.locator('.home-flow-card')).toHaveCount(4)
 await expect(page.locator('.nurse-station-growth-data')).toContainText('身高')
 for(const width of [320,375,390]){await page.setViewportSize({width,height:667});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
 await page.getByRole('button',{name:'和护士说说',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'智能记录',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'键盘输入',exact:true}).click()
 await page.getByLabel('原始记录内容').fill('昨天吃了粥，午睡一个小时')
 await page.getByRole('button',{name:'关闭智能记录',exact:true}).click()
 await page.getByRole('button',{name:'和护士说说',exact:true}).click()
 await page.getByRole('button',{name:'键盘输入',exact:true}).click()
 await expect(page.getByLabel('原始记录内容')).toHaveValue('昨天吃了粥，午睡一个小时')
 await page.getByRole('button',{name:'关闭智能记录',exact:true}).click()
 await page.getByRole('button',{name:'生成就诊情况单',exact:true}).click();await expect(page).toHaveURL(/visit-summary/)
})
test('真实原记录最早查询、复制、详情返回与继续限定保留问题',async({page,request})=>{
 const event=await(await request.post('/api/events',{headers,data:{memberId:'empty-child',title:'合成测试皮肤观察',category:'other',startTime:'2026-08-01T10:00:00Z'}})).json()
 for(const [content,occurredAt] of [['屁股红疹','2026-08-01T10:00:00Z'],['脸上红疹','2026-09-01T10:00:00Z'],['腿上痘痘','2026-07-01T10:00:00Z']])await request.post(`/api/events/${event.id}/records`,{headers,data:{type:'symptom',content,occurredAt,journal:{categories:['symptom'],timePrecision:'exact'}}})
 await page.getByRole('button',{name:'查找记录',exact:true}).click()
 await page.getByRole('textbox',{name:'想查什么',exact:true}).fill('第一次红疹是什么时候')
 await page.getByRole('button',{name:'查找',exact:true}).click()
 await expect(page.getByLabel('查找结果')).toContainText('已有记录中最早明确写到')
 await expect(page.getByLabel('查找结果')).toContainText('屁股红疹')
 await page.getByRole('button',{name:'查看详情',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible()
 await page.getByRole('button',{name:/关闭/}).last().click()
 await expect(page.getByLabel('查找结果')).toContainText('已有记录中最早明确写到')
 await page.getByRole('textbox',{name:'想查什么',exact:true}).fill('只看屁股上的')
 await page.getByRole('button',{name:'查找',exact:true}).click()
 await expect(page.getByLabel('查找结果')).toContainText('屁股红疹');await expect(page.getByLabel('查找结果')).not.toContainText('脸上红疹')
})
