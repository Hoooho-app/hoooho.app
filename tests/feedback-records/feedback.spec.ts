import {test,expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
const raw='今天喝了配方奶，后来出现红屁股。'

test('mixed AI draft, editable labels, one save, both filters and symptom search; dark voice button remains visible',async({page,request},info)=>{
 const member=await request.post('/api/members',{headers,data:{name:'反馈验收（虚构）',relationship:'child',gender:'female',birthday:'2024-01-01'}});expect(member.ok()).toBeTruthy();const memberId=(await member.json()).id
 await request.get('http://127.0.0.1:4198/success')
 await request.post('http://127.0.0.1:4198/draft-data',{data:{items:[{category:'diet',title:'喂养',timeText:'今天',archiveCategory:null,subject:'current',relationKey:null,fields:[{name:'food',value:'配方奶',quote:'配方奶',sourceId:'input',page:1}]}]}})
 await page.addInitScript(({token,memberId})=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:memberId,members:[],profile:null},version:5}))},{token,memberId})
 await page.goto('/smart-record?source=front-desk')
 await page.getByRole('button',{name:'改用文字'}).click();await page.getByLabel('对话输入').fill(raw);await page.getByRole('button',{name:'发送',exact:true}).click()
 await page.getByRole('button',{name:'帮我整理',exact:true}).click();await page.getByRole('button',{name:'核对 1 条记录',exact:true}).click()
 await expect(page.locator('.smart-record-item header')).toContainText('饮食 · 症状')
 await expect(page.locator('.smart-record-item')).toContainText('后来出现红屁股')
 await page.locator('.smart-record-item summary').click();await expect(page.getByRole('button',{name:'症状',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.screenshot({path:info.outputPath('mixed-review.png')})
 await page.getByRole('button',{name:'确认保存 1 条',exact:true}).click();await expect(page.getByText('饮食、症状已记好',{exact:false})).toBeVisible()
 const index=await request.get(`/api/members/${memberId}/journal-index`,{headers});expect(index.ok()).toBeTruthy();const data=await index.json();expect(data.records).toHaveLength(1);const id=data.records[0].id;expect(data.records[0].journal.categories).toEqual(['diet','symptom'])
 await page.goto('/health-events');await page.getByLabel('选择日期').fill(new Date(data.records[0].occurredAt).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}));
 for(const category of ['feeding','symptom']){await page.getByLabel('筛选记录类型').selectOption(category);await expect(page.locator(`[data-record-id="${id}"]`)).toHaveCount(1)}
 const requests:string[]=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));await page.goto('/quick-search');const hold=page.getByRole('button',{name:'按住说话',exact:true});await expect(hold).toBeEnabled();await expect(hold).toBeInViewport();
 expect(await hold.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(39, 51, 50)')
 await page.getByLabel('查找记录文字').fill('红屁股');await expect(page.locator('.journal-search-result')).toHaveCount(1);await expect(page.locator('.journal-search-result')).toContainText('红屁股')
 expect(requests.filter(p=>p.endsWith('/journal-index'))).toHaveLength(1);expect(requests.filter(p=>/\/api\/events\/[^/]+\/(records|attachments)/.test(p))).toHaveLength(0)
 await page.screenshot({path:info.outputPath('quick-search.png')})
 await page.locator('.journal-search-result').click();await expect(page.getByRole('dialog')).toContainText('红屁股')
})
