import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'})
test.beforeEach(async({page,request})=>{
 const response=await request.post('/api/members',{headers:{Authorization:`Bearer ${token}`},data:{name:'能力测试（合成）',relationship:'child',birthday:'2024-01-01'}})
 expect(response.ok()).toBeTruthy();const memberId=(await response.json()).id
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
})
test('three banners explain themselves; exact portrait, back, focus, pause and recovery',async({page},info)=>{
 await page.clock.install();await page.goto('/nurse-station');const hero=page.locator('.front-desk-welcome__hero')
 await expect(hero).toBeVisible();await page.waitForLoadState('networkidle')
 const portrait=await hero.locator('img').getAttribute('src')
 await hero.click();let dialog=page.getByRole('dialog',{name:'认识你的记录员'})
 await expect(dialog).toBeVisible();await expect(dialog).toContainText('19 份许可选段')
 await expect(dialog.locator('img')).toHaveAttribute('src',portrait!)
 await page.clock.runFor(15000);await expect(hero).toHaveAttribute('data-slide','0')
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy()
 await page.screenshot({path:info.outputPath('nurse-sheet.png'),fullPage:true})
 await page.goBack();await expect(dialog).toHaveCount(0);await expect(hero).toBeVisible()
 for(const [kind,title] of [['visit','一键整理，一次说清'],['memory','记忆如何留下']]){
  await page.goto('/nurse-station?banner='+kind);dialog=page.getByRole('dialog',{name:title});await expect(dialog).toBeVisible();await page.getByRole('button',{name:'了解了',exact:true}).click();await expect(dialog).toHaveCount(0)
 }
 await page.route('**/api/capabilities/profile',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'合成服务中断'}})}))
 await hero.focus();await page.keyboard.press('Enter');dialog=page.getByRole('dialog');await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog).not.toContainText('19 份许可选段')
 await page.unroute('**/api/capabilities/profile');await dialog.getByRole('button',{name:'重新读取专业资料'}).click();await expect(dialog).toContainText('19 份许可选段')
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(hero).toBeFocused()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
})
