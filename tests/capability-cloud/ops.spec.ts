import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const token=new TokenService('ops-workspace-synthetic-secret',3600000).create({id:'synthetic-ops-admin',email:'ops@example.test'})
test('administrator can inspect all targets, source prose, retrieval and persistent versioned checks',async({page,request},info)=>{
 await request.post('/__test/reset');await page.addInitScript(token=>sessionStorage.setItem('hoooho-ops-auth-token',token),token)
 await page.goto('/ops/capabilities');await expect(page.getByRole('heading',{name:'完整目标 · 72 项'})).toBeVisible()
 await page.getByRole('button',{name:'专业资料',exact:true}).click();await page.getByRole('button',{name:'查看原文'}).first().click();await expect(page.getByRole('dialog',{name:'专业资料原文'})).toContainText('CC BY 4.0');await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'检索试用'}).click();await page.getByRole('button',{name:'检索专业资料',exact:true}).click();await expect(page.getByRole('heading',{name:'进入模型上下文的记录方法'})).toBeVisible()
 await page.getByRole('button',{name:'验证记录',exact:true}).click();await page.getByRole('button',{name:'运行规则检查并保存回执'}).click();await expect(page.locator('.capability-result summary')).toContainText('13/13')
 await page.reload();await page.getByRole('button',{name:'验证记录',exact:true}).click();await expect(page.locator('.capability-result summary')).toContainText('当前知识版本')
 await page.screenshot({path:info.outputPath('capability-console.png'),fullPage:true})
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
})
