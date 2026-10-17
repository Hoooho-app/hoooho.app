import {test,expect,type Page} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import {mkdir} from 'node:fs/promises'
const token=new TokenService('time-view-e2e-local-only-secret',3600000).create({id:'time-view-test-account'})
async function prepare(page:Page,path:string){
  await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);if(!sessionStorage.getItem('return-initialized')){localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'time-view-test-account'},currentMemberId:'child-one',members:[],profile:null},version:5}));sessionStorage.setItem('return-initialized','true')}},token)
  await page.goto(path)
}
const entries=[['记录症状'],['喂养/饮食'],['日常','睡眠'],['日常','排便'],['日常','身体涂抹'],['用药'],['就诊资料'],['智能记录']]
async function open(page:Page,path:string,entry:string[]){
  const root=page.locator(path==='/nurse-station'?'.home-flows .record-entry-actions':'.journal-record-actions')
  await expect(root.getByRole('button',{name:entry[0],exact:true})).toBeEnabled()
  await root.getByRole('button',{name:entry[0],exact:true}).click()
  if(entry[1])await page.getByRole('group',{name:'记录日常选项'}).getByRole('button',{name:entry[1],exact:true}).click()
  if(entry[0]==='智能记录')await expect(page.getByRole('heading',{name:'智能记录',exact:true})).toBeVisible()
  else await expect(page.getByRole('dialog')).toBeVisible()
}
for(const width of [375,390,430])for(const source of ['/nurse-station','/health-events'])test(`${width} ${source}: every record entry returns to its actual source`,async({page})=>{
  await page.setViewportSize({width,height:667});await prepare(page,source)
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  for(const entry of entries){
    for(const method of ['header','browser']){
      await open(page,source,entry)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
      if(method==='browser')await page.goBack()
      else if(entry[0]==='智能记录')await page.getByRole('button',{name:'返回',exact:true}).click()
      else await page.getByRole('dialog').getByRole('button',{name:/^返回/}).first().click()
      await expect(page).toHaveURL(new RegExp(source+'(?:\\?|$)'))
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('heading',{name:source==='/nurse-station'?'服务前台':'健康日历',exact:true})).toBeVisible()
    }
  }
  expect(errors).toEqual([])
  if(width===375&&source==='/nurse-station'){await mkdir('outputs/frontdesk-record-return',{recursive:true});await page.screenshot({path:'outputs/frontdesk-record-return/returned-frontdesk.png'})}
})
test('front desk feeding ordinary and duplicate-confirmed saves return to front desk',async({page})=>{
  await prepare(page,'/nurse-station');await open(page,'/nurse-station',['喂养/饮食'])
  const form=page.getByRole('dialog',{name:'喂养/饮食',exact:true})
  await form.getByRole('radio',{name:'配方奶',exact:true}).click();await form.getByLabel('喂奶量').fill('123')
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/quick-records'&&r.request().method()==='POST')
  await form.getByRole('button',{name:'保存记录',exact:true}).click()
  const response=await saved;expect(response.status()).toBe(201)
  const result=await response.json(),records=await(await page.request.get(`/api/events/${result.eventId}/records`,{headers:{Authorization:`Bearer ${token}`}})).json()
  expect(records.some((r:{id:string})=>r.id===result.recordId)).toBe(true)
  await expect(page).toHaveURL(/\/nurse-station$/);await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.route('**/api/quick-records/duplicate-check',route=>route.fulfill({json:{duplicate:{eventId:result.eventId,recordId:result.recordId,occurredAt:new Date().toISOString(),summary:'配方奶123ml',hasClearChange:false,changeSummary:''}}}))
  await open(page,'/nurse-station',['喂养/饮食'])
  await form.getByRole('radio',{name:'配方奶',exact:true}).click();await form.getByLabel('喂奶量').fill('123')
  await form.getByRole('button',{name:'保存记录',exact:true}).click()
  const duplicate=page.getByRole('dialog',{name:'可能已记录过',exact:true});await expect(duplicate).toBeVisible()
  const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/quick-records'&&r.request().method()==='POST')
  await duplicate.getByRole('button',{name:'仍然新增一条',exact:true}).click();expect((await created).status()).toBe(201)
  await expect(page).toHaveURL(/\/nurse-station$/);await expect(page.getByRole('dialog')).toHaveCount(0)
})
