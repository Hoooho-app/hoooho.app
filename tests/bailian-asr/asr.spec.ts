import { expect,test } from '@playwright/test'
import { TokenService } from '../../server/auth/token-service.mjs'
const token=new TokenService('visit-sheet-e2e-secret',3600000).create({id:'visit-test'}),headers={Authorization:`Bearer ${token}`}
const status=async(request:any)=>(await request.get('http://127.0.0.1:4198/status')).json()
async function openCase(page:any,request:any,memberId:string){const saved=await(await request.post(`/api/members/${memberId}/case-records`,{headers,data:{text:'合成语音验收，非真实患者资料',files:[],requestId:crypto.randomUUID(),timeUnknown:true,identity:'parent'}})).json();await page.goto(`/cases/${saved.eventId}/materials?recordId=${saved.recordId}`);await page.getByRole('button',{name:'智能整理原件',exact:true}).click();await page.getByRole('combobox',{name:'资料类型'}).selectOption('record');await page.getByLabel('原始记录内容').fill('')}
test.beforeEach(async({page,request})=>{await request.get('http://127.0.0.1:4198/success');await request.get('http://127.0.0.1:4198/voice?text='+encodeURIComponent('今天没有呕吐，只是恶心'));await request.post('http://127.0.0.1:4198/draft-data',{data:{items:null}});await page.addInitScript(token=>{sessionStorage.setItem('hoooho-auth-token',token);localStorage.setItem('hoooho-app',JSON.stringify({state:{authUser:{id:'visit-test'},currentMemberId:'child-a',members:[],profile:null},version:5}))},token);await openCase(page,request,'child-a')})
test('录音停止→独立百炼转写→可编辑→主动整理→确认保存，不启用TTS或自动保存',async({page,request})=>{
 const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true}),before=await status(request)
 await expect(sheet.getByRole('checkbox',{name:/对话式记录/})).toBeDisabled();await expect(sheet.getByLabel('原始记录内容')).toBeVisible()
 let audioMime='';page.on('request',r=>{if(r.url().endsWith('/api/ai/audio/transcriptions'))audioMime=r.postDataJSON().mimeType})
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await expect(sheet.getByRole('button',{name:/停止录音/})).toBeVisible();await page.waitForTimeout(1100);await sheet.getByRole('button',{name:/停止录音/}).click()
 await expect(sheet.getByRole('status').filter({hasText:'正在转写为文字'})).toBeVisible()
 await sheet.getByLabel('原始记录内容').fill('合成家长补充。')
 await expect(sheet.getByLabel('原始记录内容')).toHaveValue('合成家长补充。\n今天没有呕吐，只是恶心')
 expect(audioMime).toBe('audio/wav');expect((await status(request)).asrCalls-before.asrCalls).toBe(1);expect((await status(request)).calls-before.calls).toBe(0)
 await sheet.getByLabel('原始记录内容').fill('今天没有呕吐，只是恶心')
 await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click();await expect(sheet.getByRole('button',{name:'已核对，一次保存 1 条'})).toBeEnabled()
 await sheet.getByRole('button',{name:'已核对，一次保存 1 条'}).click();await expect(sheet.getByRole('status').filter({hasText:'已保存 1 条'})).toContainText('已保存 1 条')
 expect((await status(request)).calls-before.calls).toBe(1);expect((await status(request)).speechCalls-before.speechCalls).toBe(0)
 await sheet.getByRole('button',{name:'撤销本次保存',exact:true}).click()
})
test('转写额度失败保留旧草稿/输入，文字可编辑、图片可上传、手动重试无自动调用',async({page,request})=>{
 const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true});await sheet.getByLabel('原始记录内容').fill('今天没有呕吐，只是恶心');await sheet.getByRole('button',{name:'整理成待确认记录',exact:true}).click();await expect(sheet.getByLabel('记录类型')).toBeVisible()
 const previous=await(await request.get('/api/members/child-a/ai-drafts',{headers})).json(),before=await status(request)
 await request.get('http://127.0.0.1:4198/failure');await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);await sheet.getByRole('button',{name:/停止录音/}).click();await expect(sheet.getByRole('alert')).toContainText('语音免费额度已用尽')
 await expect(sheet.getByRole('button',{name:'重试语音转写',exact:true})).toBeEnabled();await expect(sheet.getByLabel('原始记录内容')).toHaveValue(previous.inputText);await expect(sheet.getByLabel('记录类型')).toBeVisible();await expect(sheet.locator('input[type=file]').first()).toBeEnabled()
 await sheet.getByLabel('原始记录内容').fill('继续打字记录');await expect(sheet.getByRole('button',{name:'继续整理这份草稿',exact:true})).toBeEnabled()
 expect((await status(request)).asrCalls-before.asrCalls).toBe(1);expect((await status(request)).calls-before.calls).toBe(0)
 const retained=await(await request.get(`/api/members/child-a/ai-drafts/${previous.id}`,{headers})).json();expect(retained.version).toBe(previous.version);expect(retained.items).toEqual(previous.items)
 await request.get('http://127.0.0.1:4198/success');await sheet.getByRole('button',{name:'重试语音转写',exact:true}).click();await expect(sheet.getByLabel('原始记录内容')).toHaveValue('继续打字记录\n今天没有呕吐，只是恶心');expect((await status(request)).asrCalls-before.asrCalls).toBe(2)
})
test('能力查询无需供应商请求且受认证保护；越权成员在出站前拒绝',async({request})=>{
 const before=await status(request),caps=await request.get('/api/ai/audio/capabilities',{headers});expect(caps.ok()).toBe(true);expect((await caps.json()).asr.configured).toBe(true);expect((await caps.json()).tts.configured).toBe(false)
 expect((await request.get('/api/ai/audio/capabilities',{headers:{Authorization:'Bearer invalid'}})).status()).toBe(401)
 const denied=await request.post('/api/ai/audio/transcriptions',{headers,data:{memberId:'outside-account',mimeType:'audio/webm',dataUrl:'data:audio/webm;base64,U1lOVEhFVElD'}});expect(denied.status()).toBe(404);expect((await status(request)).asrCalls).toBe(before.asrCalls)
})

test('打断转写后可主动重试保留录音，且不会阻塞文字图片',async({page})=>{
 const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true});await sheet.getByLabel('原始记录内容').fill('先前文字仍保留')
 await page.route('**/api/ai/audio/transcriptions',async route=>{await new Promise(r=>setTimeout(r,800));await route.fulfill({json:{transcript:'旧的延迟结果'}}).catch(()=>{})})
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);const requested=page.waitForRequest(r=>r.url().endsWith('/api/ai/audio/transcriptions'));await sheet.getByRole('button',{name:/停止录音/}).click();await requested
 await sheet.getByRole('button',{name:'打断',exact:true}).click()
 await expect(sheet.getByRole('button',{name:'重试语音转写',exact:true})).toBeEnabled()
 await expect(sheet.getByLabel('原始记录内容')).toHaveValue('先前文字仍保留');await expect(sheet.locator('input[type=file]').first()).toBeEnabled()
 await page.waitForTimeout(900);await expect(sheet.getByLabel('原始记录内容')).toHaveValue('先前文字仍保留')
})

test('同一普通会话三次不同描述各用新录音字节，无隐藏整理或测试白名单',async({page,request})=>{
 const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true}),before=await status(request),texts=['昨晚睡得不好，今天早上精神还可以。','下午吃了半碗粥，喝了一百毫升奶。','右胳膊有一点红，暂时没有发烧。'],payloads:string[]=[]
 // Each offline microphone source is deliberately different. Chrome's default
 // fake beep can produce identical bytes for equal-length recordings.
 await page.evaluate(()=>{const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let sequence=0;navigator.mediaDevices.getUserMedia=async constraints=>{const granted=await native(constraints);granted.getTracks().forEach(t=>t.stop());const context=new AudioContext(),source=context.createOscillator(),destination=context.createMediaStreamDestination();source.frequency.value=400+(++sequence)*130;source.connect(destination);source.start();await context.resume();destination.stream.getTracks().forEach(track=>{const stop=track.stop.bind(track);track.stop=()=>{stop();source.stop();void context.close()}});return destination.stream}})
 page.on('request',r=>{if(r.url().endsWith('/api/ai/audio/transcriptions')){const input=r.postDataJSON();expect(input.memberId).toBe('child-a');expect(input.syntheticReplay).toBeUndefined();payloads.push(input.dataUrl)}})
 let expected=''
 for(const text of texts){await request.get('http://127.0.0.1:4198/voice?text='+encodeURIComponent(text));await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);await sheet.getByRole('button',{name:/停止录音/}).click();expected=expected?expected+'\n'+text:text;await expect(sheet.getByLabel('原始记录内容')).toHaveValue(expected);await expect(sheet.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled()}
 expect(payloads).toHaveLength(3);expect(new Set(payloads).size).toBe(3);expect((await status(request)).asrCalls-before.asrCalls).toBe(3);expect((await status(request)).calls-before.calls).toBe(0)
})

test('错误码优先于失实文案，失败后重新录音仍走ASR且保留已选图片',async({page,request})=>{
 const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true}),before=await status(request)
 await sheet.getByLabel('原始记录内容').fill('保留原稿');await sheet.locator('input[type=file]').first().setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('synthetic offline attachment')})
 await page.route('**/api/ai/audio/transcriptions',route=>route.fulfill({status:503,json:{error:{code:'ASR_NETWORK_ERROR',message:'语音转写服务尚未配置，请改用文字记录'}}}))
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);await sheet.getByRole('button',{name:/停止录音/}).click();await expect(sheet.getByRole('alert')).toContainText('连接失败');await expect(sheet.getByRole('alert')).not.toContainText('未配置');await expect(sheet.getByText('1 份待整理资料')).toBeVisible()
 await page.unroute('**/api/ai/audio/transcriptions');await request.get('http://127.0.0.1:4198/voice?text='+encodeURIComponent('普通描述新的转写'))
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);await sheet.getByRole('button',{name:/停止录音/}).click();await expect(sheet.getByLabel('原始记录内容')).toHaveValue('保留原稿\n普通描述新的转写');await expect(sheet.getByText('1 份待整理资料')).toBeVisible();expect((await status(request)).asrCalls-before.asrCalls).toBe(1)
})

test('实际转码失败不误报未配置，无供应商请求且可重新录音',async({page,request})=>{
 const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true}),before=await status(request)
 await page.evaluate(()=>{const original=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=function(...args){AudioContext.prototype.decodeAudioData=original;return Promise.reject(new DOMException('synthetic invalid encoded bytes','EncodingError'))}})
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);await sheet.getByRole('button',{name:/停止录音/}).click();await expect(sheet.getByRole('alert')).toContainText('转换失败');await expect(sheet.getByRole('alert')).not.toContainText('未配置');expect((await status(request)).asrCalls-before.asrCalls).toBe(0)
 await sheet.getByRole('button',{name:'重试语音转写',exact:true}).click();await expect(sheet.getByLabel('原始记录内容')).toHaveValue('今天没有呕吐，只是恶心');expect((await status(request)).asrCalls-before.asrCalls).toBe(1)
})

test('关闭弹窗后的迟到结果不覆盖新会话；重新打开可录音',async({page})=>{
 const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true});let calls=0
 await page.route('**/api/ai/audio/transcriptions',async route=>{calls++;if(calls===1)await new Promise(r=>setTimeout(r,900));await route.fulfill({json:{transcript:calls===1?'旧会话不得进入':'新的普通转写'}}).catch(()=>{})})
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);const started=page.waitForRequest(r=>r.url().endsWith('/api/ai/audio/transcriptions'));await sheet.getByRole('button',{name:/停止录音/}).click();await started
 await sheet.getByRole('button',{name:'关闭智能整理记录',exact:true}).click();await page.getByRole('button',{name:'智能整理原件',exact:true}).click();await sheet.getByLabel('原始记录内容').fill('新会话输入');await page.waitForTimeout(1000);await expect(sheet.getByLabel('原始记录内容')).toHaveValue('新会话输入')
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);await sheet.getByRole('button',{name:/停止录音/}).click();await expect(sheet.getByLabel('原始记录内容')).toHaveValue('新会话输入\n新的普通转写')
})

test('切换孩子取消旧转写，迟到结果不进入新孩子且可继续录音',async({page,request})=>{
 const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true});let posts=0
 await page.route('**/api/ai/audio/transcriptions',async route=>{posts++;if(posts===1)await new Promise(r=>setTimeout(r,1100));await route.fulfill({json:{transcript:posts===1?'旧孩子结果不能进入':'新孩子的转写'}}).catch(()=>{})})
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);const waiting=page.waitForRequest(r=>r.url().endsWith('/api/ai/audio/transcriptions'));await sheet.getByRole('button',{name:/停止录音/}).click();await waiting
 await request.post('/api/auth/current-member',{headers,data:{memberId:'empty-child'}})
 await page.addInitScript(()=>{const store=JSON.parse(localStorage.getItem('hoooho-app')!);store.state.currentMemberId='empty-child';localStorage.setItem('hoooho-app',JSON.stringify(store))});await page.reload();await expect(page.getByRole('button',{name:'智能整理原件',exact:true})).toHaveCount(0);await openCase(page,request,'empty-child');await page.waitForTimeout(1200);await expect(sheet.getByLabel('原始记录内容')).toHaveValue('')
 let member='';page.on('request',r=>{if(r.url().endsWith('/api/ai/audio/transcriptions'))member=r.postDataJSON().memberId})
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);await sheet.getByRole('button',{name:/停止录音/}).click();await expect(sheet.getByLabel('原始记录内容')).toHaveValue('新孩子的转写');expect(member).toBe('empty-child')
})

test('后台中止转写保留录音，新操作不会被旧请求解锁或覆盖',async({page})=>{
 const sheet=page.getByRole('dialog',{name:'智能整理记录',exact:true});let posts=0
 await page.route('**/api/ai/audio/transcriptions',async route=>{posts++;await new Promise(r=>setTimeout(r,posts===1?1000:1700));await route.fulfill({json:{transcript:posts===1?'旧结果':'主动重试的普通转写'}}).catch(()=>{})})
 await sheet.getByRole('button',{name:'开始录音',exact:true}).click();await page.waitForTimeout(1100);const waiting=page.waitForRequest(r=>r.url().endsWith('/api/ai/audio/transcriptions'));await sheet.getByRole('button',{name:/停止录音/}).click();await waiting
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'))})
 await expect(sheet.getByRole('button',{name:'重试语音转写',exact:true})).toBeEnabled();await page.waitForTimeout(250);await sheet.getByRole('button',{name:'重试语音转写',exact:true}).click();await page.waitForTimeout(1150);await expect(sheet.getByRole('button',{name:'开始录音',exact:true})).toBeDisabled();await expect(sheet.getByLabel('原始记录内容')).toHaveValue('');await expect(sheet.getByLabel('原始记录内容')).toHaveValue('主动重试的普通转写');expect(posts).toBe(2)
})
