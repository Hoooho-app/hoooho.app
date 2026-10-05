import {test,expect,type Page,type APIRequestContext} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import {randomUUID} from 'node:crypto'
let token:string,headers:{Authorization:string},memberId:string
test.beforeEach(async({page,request})=>{
  const registration=await request.post('/api/auth/register',{data:{nickname:`inlineqa${randomUUID().slice(0,8)}`,password:randomUUID(),idempotencyKey:randomUUID()}});expect(registration.ok()).toBeTruthy();const session=await registration.json();token=session.token;headers={Authorization:`Bearer ${token}`};await page.context().addCookies((await request.storageState()).cookies)
  const response=await request.post('/api/members',{headers,data:{name:'五页合成验收',birthday:'2024-12-20',gender:'female',relationship:'child'}});expect(response.ok()).toBeTruthy();memberId=(await response.json()).id
  const selected=await request.post('/api/auth/current-member',{headers,data:{memberId}});expect(selected.ok()).toBeTruthy()
  await page.addInitScript(({token,memberId,accountId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:accountId},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId,accountId:session.user.id})
})
async function seed(request:APIRequestContext,kind:string,records:unknown[]){const response=await request.post('/api/auth/profile-sections',{headers,data:{memberId,sectionId:kind,records,revision:0}});expect(response.ok()).toBeTruthy()}
async function list(request:APIRequestContext,kind:string){const response=await request.get(`/api/members/${memberId}/profile-list/${kind}`,{headers});expect(response.ok()).toBeTruthy();return response.json()}
async function add(page:Page,name:string){await page.getByRole('button',{name:'新增',exact:true}).click();const form=page.locator('.inline-profile-editor');await form.locator('input[type=text],input:not([type])').fill(name);await form.getByRole('button',{name:'保存',exact:true}).click();await expect(form).toHaveCount(0)}

test('五页真实API列表、分类/空态/新增编辑删除撤销、四尺寸和大字无溢出',async({page,request})=>{
  const old={id:'c1',name:'已明确牛奶',category:'food',currentStatus:'confirmed',sourceLabel:'保留来源',attachmentIds:['source-original']}
  await seed(request,'allergy',[old,{id:'p1',name:'不能展示的待排查',category:'food',currentStatus:'investigating'}])
  await seed(request,'surgery',[{id:'s1',name:'旧头部手术',category:'头',date:'2024-01-01',anesthesia:'原麻醉'},{id:'s2',name:'旧腿部手术',category:'腿'}])
  for(const kind of ['allergy','chronic','family-history','surgery','vaccination']){
    await page.goto(`/health-profile/${kind}`);await expect(page.locator('.inline-profile-tabs button').first()).toBeVisible().catch(async()=>{expect(kind).toBe('surgery')})
    await expect(page.getByText('正在读取档案…')).toHaveCount(0);await expect(page.locator('form')).toHaveCount(0)
    if(kind==='allergy'){await expect(page.getByText(old.name,{exact:true})).toBeVisible();await expect(page.getByText('不能展示的待排查')).toHaveCount(0);expect((await list(request,kind)).compatibility.pendingAllergies).toBe(1)}
    if(kind==='family-history')expect(await page.locator('.inline-profile-tabs button').allTextContents()).toEqual(['父亲','母亲','祖父','祖母',''])
    if(kind==='surgery'){await expect(page.locator('.inline-profile-tabs')).toHaveCount(0);await expect(page.locator('.inline-profile-item')).toHaveCount(2)}
    for(const [width,height] of [[320,667],[375,667],[390,844],[430,932]]){await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.getByRole('button',{name:'新增',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);await page.screenshot({path:`outputs/child-profile-inline/${kind}-${width}.png`,fullPage:true})}
    await page.setViewportSize({width:375,height:667});const name=`合成${kind}`;await add(page,name);const matching=page.locator('.inline-profile-item').filter({has:page.getByText(name,{exact:true})});await expect(matching).toBeVisible();const row=page.locator(`.inline-profile-item[data-record-id="${await matching.getAttribute('data-record-id')}"]`)
    await row.getByRole('button',{name:`编辑${name}`,exact:true}).click();const form=row.locator('form');await form.locator('input[type=text],input:not([type])').fill(`${name}编辑`);await form.getByRole('button',{name:'取消',exact:true}).click();await expect(row.getByText(name,{exact:true})).toBeVisible()
    await row.getByRole('button',{name:`删除${name}`,exact:true}).click();await row.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByText(name,{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByText(name,{exact:true})).toBeVisible()
    const largeFont=await page.addStyleTag({content:'html{font-size:24px}'});expect(await page.evaluate(()=>({width:innerWidth,overflow:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right}))}))).toEqual({width:375,overflow:[]});await largeFont.evaluate(e=>e.remove())
  }
})
test('草稿按孩子/分类/条目隔离，返回及刷新保留，频率失败重试与旧字段局部更新',async({page,request})=>{
  await seed(request,'chronic',[{id:'chronic-old',name:'原长期问题',profileCategory:'皮肤',frequency:'没有固定频率',note:'不能清空的旧备注'}])
  await page.goto('/health-profile/chronic');await page.getByRole('button',{name:'呼吸道',exact:true}).click();await page.getByRole('button',{name:'新增',exact:true}).click();await page.getByLabel('长期健康问题',{exact:true}).fill('返回也保留的草稿')
  await page.getByRole('button',{name:'皮肤',exact:true}).click();await expect(page.getByText('返回也保留的草稿')).toHaveCount(0);await page.getByRole('button',{name:'呼吸道',exact:true}).click();await expect(page.getByLabel('长期健康问题',{exact:true})).toHaveValue('返回也保留的草稿')
  await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('button',{name:/慢性病史/}).click();await expect(page.getByLabel('长期健康问题',{exact:true})).toHaveValue('返回也保留的草稿');await page.reload();await expect(page.getByLabel('长期健康问题',{exact:true})).toHaveValue('返回也保留的草稿')
  await page.getByRole('button',{name:'取消',exact:true}).click();await page.reload();await expect(page.locator('form')).toHaveCount(0)
  await page.getByRole('button',{name:'皮肤',exact:true}).click();const row=page.locator('.inline-profile-item');await row.locator('summary').click();await expect(row.getByRole('button',{name:'每天',exact:true})).toHaveAttribute('aria-pressed','false')
  let failed=true;await page.route('**/profile-list/chronic',async route=>{if(route.request().method()==='POST'&&failed){failed=false;return route.fulfill({status:503,json:{error:{message:'合成保存失败'}}})}await route.continue()})
  await row.getByRole('button',{name:'每周',exact:true}).click();await expect(page.getByRole('alert')).toContainText('合成保存失败');await expect(row.getByRole('button',{name:'每周',exact:true})).toHaveAttribute('aria-pressed','true');await row.getByRole('button',{name:'重试保存频率',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload();await row.locator('summary').click();await expect(row.getByRole('button',{name:'每周',exact:true})).toHaveAttribute('aria-pressed','true')
  const stored=await(await request.get('/api/auth/profile-sections',{headers})).json();expect(stored.find((s:any)=>s.memberId===memberId&&s.sectionId==='chronic').records[0].note).toBe('不能清空的旧备注')
})
test('家族关系刷新持久化；疫苗日期折叠、改日期移动年龄组、同名不同次允许保存',async({page,request})=>{
  await page.goto('/health-profile/family-history');await page.getByRole('button',{name:'添加亲属关系',exact:true}).click();await page.getByLabel('亲属关系',{exact:true}).fill('姑姑');await page.getByRole('button',{name:'添加关系',exact:true}).click();await expect(page.getByRole('button',{name:'姑姑',exact:true})).toHaveAttribute('aria-pressed','true');await page.reload();await expect(page.getByRole('button',{name:'姑姑',exact:true})).toHaveAttribute('aria-pressed','true');await add(page,'过敏性鼻炎')
  await page.goto('/health-profile/vaccination');await page.getByRole('button',{name:'2岁',exact:true}).click();await add(page,'乙肝疫苗');await expect(page.getByLabel('接种日期',{exact:true})).toBeHidden()
  let row=page.locator('.inline-profile-item');await row.locator('summary').click();await row.getByLabel('接种日期',{exact:true}).fill('2025-12-19');await row.getByRole('button',{name:'保存日期',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'记录移到1岁内'})).toBeVisible();await expect(page.getByRole('button',{name:'1岁内',exact:true})).toHaveAttribute('aria-pressed','true');await page.reload();row=page.locator('.inline-profile-item');await row.locator('summary').click();await expect(row.getByLabel('接种日期',{exact:true})).toHaveValue('2025-12-19')
  await add(page,'乙肝疫苗');expect((await list(request,'vaccination')).rows).toHaveLength(2)
  const other=await(await request.post('/api/members',{headers,data:{name:'隔离合成孩子',birthday:'2024-12-20',gender:'male',relationship:'child'}})).json();const endpoint=`/api/members/${other.id}/profile-list/vaccination`;expect((await(await request.get(endpoint,{headers})).json()).rows).toHaveLength(0)
  const wrong=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'no-access'});expect((await request.get(`/api/members/${memberId}/profile-list/vaccination`,{headers:{Authorization:`Bearer ${wrong}`}})).status()).toBeGreaterThanOrEqual(400)
})
