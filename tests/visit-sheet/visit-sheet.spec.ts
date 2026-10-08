import { expect, test, type Page } from '@playwright/test';
import { TokenService } from '../../server/auth/token-service.mjs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({ id: 'visit-test' }), headers = { Authorization: 'Bearer ' + token }, endpoint = '/api/members/child-a/visit-sheet';
// Linux Chromium's bundled decoder supports VP8; Windows keeps MP4 coverage.
const webmFixture = () => process.platform === 'linux' || test.info().project.name === 'webkit-se';
const videoId = () => webmFixture() ? 'test-webm' : 'test-video';
const videoMime = () => webmFixture() ? 'video/webm' : 'video/mp4';
const videoName = () => webmFixture() ? '合成视频上传.webm' : '合成视频上传.mp4';
const read = async (p: Page) => (await (await p.request.get(endpoint, { headers })).json()).report;
async function enter(p: Page, member = 'child-a') { await p.addInitScript(({ token, member }) => { sessionStorage.setItem('hoooho-auth-token', token); localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: 'visit-test' }, currentMemberId: member, members: [], profile: null }, version: 5 })); }, { token, member }); await p.goto('/visit-summary'); await expect(p.locator('#chapter-overview h1')).toBeVisible(); }
async function verifyVideo(v: ReturnType<Page['locator']>, p: Page, offline = false) {
    await expect.poll(() => v.evaluate((e: HTMLVideoElement) => e.readyState >= 2 ? 'ready' : e.error ? 'error' : 'waiting')).not.toBe('waiting');
    const error = await v.evaluate((e: HTMLVideoElement) => e.error?.code ?? null);
    if (error) {
        expect(test.info().project.name).toBe('webkit-se');
        expect(error).toBe(4);
        test.info().annotations.push({ type: 'environment', description: 'Windows WebKit codec backend rejects a valid original (MEDIA_ERR_SRC_NOT_SUPPORTED); verified explicit original-download fallback, not video playback or real iOS.' });
        if (!offline)
            await expect(p.getByRole('dialog', { name: '视频原件' }).getByRole('alert')).toContainText('当前浏览器无法播放');
        await expect(p.getByRole('link', { name: '下载视频原件', exact: true })).toBeVisible();
        return false;
    }
    expect(await v.evaluate((e: HTMLVideoElement) => e.paused)).toBeTruthy();
    await v.evaluate((e: HTMLVideoElement) => e.play());
    await expect.poll(() => v.evaluate((e: HTMLVideoElement) => e.currentTime)).toBeGreaterThan(0);
    return true;
}
async function width(p: Page) { const v = await p.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, scroll: [...document.querySelectorAll('[data-scroll-container],.visit-subpage-body,[role=dialog]')].map(e => [e.scrollWidth, e.clientWidth]) })); expect(v.document, JSON.stringify(v)).toBeLessThanOrEqual(v.width); expect(v.body).toBeLessThanOrEqual(v.width); for (const [s, c] of v.scroll)
    expect(s, JSON.stringify(v)).toBeLessThanOrEqual(c); }
async function chapter(p: Page, title: string) { await expect(p.locator('#chapter-overview h1')).toBeVisible();const count=await p.locator('[data-reading-card]').count();await p.getByRole('button', { name: '章节目录', exact: true }).click(); const d = p.getByRole('dialog', { name: '章节目录' }); await expect(d.locator('nav button')).toHaveCount(count); await d.getByRole('button', { name: new RegExp(title) }).click(); await expect(d).toHaveCount(0); }
async function edit(p: Page, title: string) { const toggle=p.getByRole('button',{name:new RegExp('^'+title)});if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();await p.getByRole('button', { name: '编辑' + title, exact: true }).click(); return p.getByRole('dialog', { name: '编辑' + title, exact: true }); }
async function photos(p: Page) { await edit(p, '完整资料档案'); await p.getByRole('button', { name: '添加 / 调整影像', exact: true }).click(); return p.getByRole('dialog', { name: '添加 / 调整影像' }); }
async function scope(p: Page) { await edit(p, '完整资料档案'); await p.getByRole('button', { name: '调整 / 恢复资料范围', exact: true }).click(); return p.getByRole('dialog', { name: '本次资料范围', exact: true }); }
async function update(p: Page) {await p.reload();await expect(p.locator('#chapter-overview h1')).toBeVisible();await expect(p.getByRole('button',{name:'编辑目前情况',exact:true})).toBeEnabled();}
async function fromHome(p: Page) {
    await p.goto('/nurse-station');
    await p.getByRole('link', { name: /^就诊情况单，/ }).click();
    await expect(p.locator('#chapter-overview h1')).toBeVisible();
}
test.beforeEach(async ({ page: p }) => { const s = await (await p.request.get(endpoint, { headers })).json(); expect((await p.request.put(endpoint, { headers, data: { expectedVersion: s.report?.version ?? s.expectedVersion ?? 0, requestId: crypto.randomUUID(), focus: { mode: 'source', sourceId: 'record:s7' }, caseDetails: {}, question: '这些表现需要了解什么？\n何时需要就医？\n怎样护理和记录？', notes: {}, selection: null, selectedPhotoIds: ['attachment:v5-image-0', 'attachment:v5-image-1', 'attachment:' + videoId()] } })).ok()).toBeTruthy(); });
test('浏览器返回保护四项草稿，继续编辑和放弃均有明确结果', async ({page:p})=>{
    await enter(p);
    for (const [card,label] of [['目前情况','最近变化'],['本次想问','本次想问'],['相关经过与处理','相关经过与处理补充（已发生的情况）'],['完整资料档案','资料说明']]) {
        await fromHome(p);
        const before=await read(p), d=await edit(p,card);
        await d.getByRole('textbox',{name:label,exact:true}).fill('浏览器返回保护的未保存草稿');
        await p.evaluate(()=>history.back());
        await expect(d.getByText('还有未保存的内容')).toBeVisible();
        await expect(d.getByRole('alert').filter({hasText:'还有未保存的内容'})).toBeInViewport({ratio:1});
        await expect(p).toHaveURL(/\/visit-summary$/);
        await d.getByRole('button',{name:'继续编辑',exact:true}).click();
        await expect(d.getByRole('textbox',{name:label,exact:true})).toHaveValue('浏览器返回保护的未保存草稿');
        expect((await read(p)).version).toBe(before.version);
        await p.evaluate(()=>history.back());
        await d.getByRole('button',{name:'放弃修改',exact:true}).click();
        await expect(p).toHaveURL(/\/nurse-station$/);
        expect((await read(p)).version).toBe(before.version);
    }
});
test('浏览器返回后保存失败保留草稿，保存成功才完成返回',async({page:p})=>{
    await enter(p);await fromHome(p);
    const d=await edit(p,'目前情况'),before=await read(p);
    await d.getByLabel('最近变化').fill('返回前明确保存的变化');
    await p.evaluate(()=>history.back());
    await expect(d.getByText('还有未保存的内容')).toBeVisible();
        await expect(d.getByRole('alert').filter({hasText:'还有未保存的内容'})).toBeInViewport({ratio:1});
    await p.route('**/api/members/child-a/visit-sheet',r=>r.request().method()==='PUT'?r.fulfill({status:503,json:{error:{message:'返回前保存失败'}}}):r.continue());
    await d.getByRole('alert').getByRole('button',{name:'保存',exact:true}).click();
    await expect(d.getByText(/^返回前保存失败/)).toBeVisible();
    await expect(p).toHaveURL(/\/visit-summary$/);
    await expect(d.getByLabel('最近变化')).toHaveValue('返回前明确保存的变化');
    expect((await read(p)).version).toBe(before.version);
    await p.unroute('**/api/members/child-a/visit-sheet');
    await d.getByRole('alert').filter({hasText:'还有未保存的内容'}).getByRole('button',{name:'保存',exact:true}).click();
    await expect(p).toHaveURL(/\/nurse-station$/);
    expect((await read(p)).caseDetails.change).toBe('返回前明确保存的变化');
});
test('保存请求途中浏览器返回，保存完成后再离开且不丢迟到状态',async({page:p})=>{
    await enter(p);await fromHome(p);
    const d=await edit(p,'本次想问');
    await d.getByRole('textbox',{name:'本次想问',exact:true}).fill('保存途中返回的问题');
    let release!:()=>void, started!:()=>void;
    const gate=new Promise<void>(resolve=>release=resolve), ready=new Promise<void>(resolve=>started=resolve);
    await p.route('**/api/members/child-a/visit-sheet',async route=>{
        if(route.request().method()!=='PUT')return route.continue();
        started();await gate;await route.continue();
    });
    await d.getByRole('button',{name:'保存',exact:true}).click();await ready;
    await expect(d.getByRole('textbox',{name:'本次想问',exact:true})).toBeDisabled();
    await p.evaluate(()=>history.back());
    await expect(d.getByText('还有未保存的内容')).toBeVisible();
        await expect(d.getByRole('alert').filter({hasText:'还有未保存的内容'})).toBeInViewport({ratio:1});
    await expect(d.getByRole('button',{name:'放弃修改'})).toBeDisabled();
    release();await expect(p).toHaveURL(/\/nurse-station$/);
    expect((await read(p)).question).toBe('保存途中返回的问题');
});
test('刷新页面会保护未保存草稿，取消刷新后仍可继续编辑',async({page:p})=>{
    await enter(p);const d=await edit(p,'目前情况');
    await d.getByRole('textbox',{name:'最近变化',exact:true}).fill('刷新保护的草稿');
    const nativeDialog=p.waitForEvent('dialog');
    const reload=p.evaluate(()=>location.reload());
    const dialog=await nativeDialog;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();await reload;
    await expect(d.getByRole('textbox',{name:'最近变化',exact:true})).toHaveValue('刷新保护的草稿');
    await d.getByRole('button',{name:'返回编辑目前情况'}).click();await d.getByRole('button',{name:'放弃修改'}).click();
});
test('四卡片默认展开、独立编辑、目录键盘定位、实际全页截图无溢出', async ({ page: p }, info) => {
    const errors: string[] = [];
    p.on('pageerror', e => errors.push(e.message));
    await enter(p);
    await width(p);
    for (const [id, open] of [['overview', true], ['medication', false], ['course', false], ['sources', false]] as const)
        await expect(p.locator('#chapter-' + id + ' .visit-reading-toggle')).toHaveAttribute('aria-expanded', String(open));
    await expect(p.locator('.visit-reading-growth button')).toHaveCount(2);
    await expect(p.getByRole('button', { name: '更新情况单', exact: true })).toHaveCount(0);
    await p.screenshot({ path: info.outputPath('phone-final.png') });
    await p.locator('[data-scroll-container]').evaluate(e => { Object.assign((e as HTMLElement).style, { position: 'static', height: 'auto', overflow: 'visible' }); });
    await p.locator('.visit-report').evaluate(e => Object.assign((e as HTMLElement).style, { position:'static', overflow:'visible', height: 'auto', minHeight: '100vh' }));
    await p.locator('html,body,#root').evaluateAll(elements=>elements.forEach(e=>Object.assign((e as HTMLElement).style,{height:'auto',overflow:'visible'})));
    await p.screenshot({ path: info.outputPath('full-reader.png'), fullPage: true });
    await p.reload();
    await expect(p.locator('#chapter-overview h1')).toBeVisible();
    for (const title of ['本次想问', '相关经过与处理', '完整资料档案', '目前情况']) {
        await chapter(p, title);
        await width(p);
        const toggle = p.getByRole('button', { name: new RegExp('^' + title) }), before = await toggle.getAttribute('aria-expanded'), d = await edit(p, title);
        await width(p);
        await d.getByRole('button', { name: '返回编辑' + title }).click();
        await expect(toggle).toHaveAttribute('aria-expanded', before!);
    }
    await p.getByRole('button', { name: '章节目录' }).click();
    const d = p.getByRole('dialog', { name: '章节目录' });
    await d.getByRole('button', { name: '关闭章节目录' }).focus();
    await p.keyboard.press('Shift+Tab');
    await expect(d.getByRole('button', { name: /04/ })).toBeFocused();
    await p.keyboard.press('Escape');
    await expect(p.getByRole('button', { name: '章节目录' })).toBeFocused();
    expect(errors).toEqual([]);
});
test('四项编辑真实保存刷新、失败保留草稿和取消不改原始记录', async ({ page: p }, info) => {
    await enter(p);
    const original = await (await p.request.get('/api/events/event-a/records', { headers })).json();
    for (const [card, label, value] of [['目前情况', '目前情况', '夜间抓挠，未测体温'], ['本次想问', '本次想问', '需要检查吗？\n如何护理？'], ['相关经过与处理', '相关经过与处理补充（已发生的情况）', '护理后变化未知'], ['完整资料档案', '资料说明', '完整资料档案保存标记']]) {
        const d = await edit(p, card);
        await d.getByLabel(label, { exact: true }).fill(value);
        await d.getByRole('button', { name: '保存', exact: true }).click();
        await expect(d).toHaveCount(0);
    }
    await p.reload();
    await expect(p.locator('#chapter-overview')).toContainText('夜间抓挠，未测体温');
    const saved = await read(p);
    expect(saved.questionEdited).toBeTruthy();
    expect(saved.notes.course).toBe('护理后变化未知');
    expect(saved.notes.sources).toBe('完整资料档案保存标记');
    expect(await (await p.request.get('/api/events/event-a/records', { headers })).json()).toEqual(original);
    const d = await edit(p, '目前情况');
    await d.getByLabel('最近变化').fill('失败时保留草稿');
    await p.route('**/api/members/child-a/visit-sheet', r => r.request().method() === 'PUT' ? r.fulfill({ status: 503, json: { error: { message: '合成保存失败' } } }) : r.continue());
    await d.getByRole('button', { name: '保存', exact: true }).click();
    await expect(d.getByRole('alert')).toContainText('合成保存失败');
    await expect(d.getByLabel('最近变化')).toHaveValue('失败时保留草稿');
    expect((await read(p)).version).toBe(saved.version);
    await d.getByRole('button', { name: '返回编辑目前情况' }).click();
    await expect(d.getByText('还有未保存的内容')).toBeVisible();
        await expect(d.getByRole('alert').filter({hasText:'还有未保存的内容'})).toBeInViewport({ratio:1});
    await p.screenshot({ path: info.outputPath('edit-draft-protected.png') });
    await d.getByRole('button', { name: '放弃修改' }).click();
});
test('原图缩放关闭回焦、选图持久化、无关联主题不套旧影像', async ({ page: p }, info) => {
    await enter(p);
    const trigger = p.getByRole('button', { name: '查看原图：测试原图-0.png', exact: true });
    await trigger.click();
    const viewer = p.getByRole('dialog', { name: '照片原图' });
    await viewer.getByRole('button', { name: '放大', exact: true }).click();
    expect(await p.locator('.visit-image-viewport').evaluate(e => e.scrollWidth > e.clientWidth)).toBeTruthy();
    await p.screenshot({ path: info.outputPath('original-photo.png') });
    await viewer.getByRole('button', { name: '还原完整比例' }).click();
    await viewer.getByRole('button', { name: '关闭照片原图', exact: true }).click();
    await expect(trigger).toBeFocused();
    const picker = await photos(p);
    await picker.getByRole('checkbox', { name: '测试原图-1.png', exact: true }).uncheck();
    await picker.getByRole('button', { name: '保存影像选择' }).click();
    await expect(picker).toHaveCount(0);
    await p.reload();
    await expect(p.locator('.visit-photos img')).toHaveCount(1);
    await p.getByRole('button', { name: '更改主诉', exact: true }).click();
    await p.getByLabel('本次主诉').fill('无关联自填主题');
    await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    await expect(p.locator('.visit-photos')).toHaveCount(0);
});
test('视频原件真实播放、返回停止、纯视频、七项三列自然换行', async ({ page: p }, info) => {
    await enter(p);
    await p.getByRole('button', { name: '查看视频 3' }).click();
    const viewer = p.getByRole('dialog', { name: '视频原件' }), v = viewer.locator('video');
    await expect(v).toHaveAttribute('controls', '');
    await expect(v).toHaveAttribute('playsinline', '');
    await verifyVideo(v, p);
    await p.screenshot({ path: info.outputPath('native-video.png') });
    await v.evaluate((e: HTMLVideoElement) => (window as any).__oldVisitVideo = e);
    await viewer.getByRole('button', { name: '关闭视频原件' }).click();
    expect(await p.evaluate(() => (window as any).__oldVisitVideo.paused)).toBeTruthy();
    const r = await read(p);
    await p.request.put(endpoint, { headers, data: { expectedVersion: r.version, requestId: crypto.randomUUID(), selectedPhotoIds: ['attachment:' + videoId()] } });
    await p.reload();
    await expect(p.locator('.visit-photos figure')).toHaveCount(1);
    await expect(p.locator('.visit-photos img')).toHaveCount(0);
    await p.route('**/api/members/child-a/visit-sheet', async (route) => { const response = await route.fetch(), state = await response.json(); if (route.request().method() === 'GET' && state.report) {
        const r = state.report, photo = r.photos.find((p: any) => p.sourceId === 'attachment:v5-image-0'), source = r.sources.find((s: any) => s.id === photo.sourceId);
        r.photos = Array.from({ length: 7 }, (_, i) => ({ ...photo, sourceId: 'stress:' + i, title: '影像-' + i }));
        r.sources.push(...r.photos.map((p: any) => ({ ...source, id: p.sourceId, title: p.title })));
        r.selectedPhotoIds = r.photos.map((p: any) => p.sourceId);
    } await route.fulfill({ response, json: state }); });
    await p.reload();
    await expect(p.locator('.visit-photos figure')).toHaveCount(7);
    const cells = await p.locator('.visit-reading-media-thumb').evaluateAll(es => es.map(e => ({ y: e.getBoundingClientRect().y, h: e.getBoundingClientRect().height })));
    expect(cells[0].y).toBe(cells[2].y);
    expect(cells[3].y).toBe(cells[5].y);
    expect(cells[6].y).toBeGreaterThan(cells[5].y);
    expect(cells[0].h).toBeLessThanOrEqual(64);
    await width(p);
    await p.screenshot({ path: info.outputPath('seven-media.png') });
});
test('视频上传保存不启动 AI 分析，原件可播放', async ({ page: p }) => {
    await enter(p);
    const buffer = await (await p.request.get('/api/events/event-a/attachments/' + videoId() + '/content', { headers })).body(), jobs: string[] = [];
    p.on('request', r => { if (/symptom-media-jobs|ai\/.*media/.test(r.url()))
        jobs.push(r.url()); });
    const picker = await photos(p);
    await picker.getByLabel('选择要上传的影像').setInputFiles({ name: videoName(), mimeType: videoMime(), buffer });
    await expect(picker.getByText(/上传完成，待保存/)).toBeVisible();
    await picker.getByRole('button', { name: '保存影像选择' }).click();
    await expect(picker).toHaveCount(0);
    const video = (await read(p)).photos.find((p: any) => p.title === videoName());
    expect(video.mimeType).toBe(videoMime());
    expect(video.duration).toBeGreaterThan(0);
    expect(jobs).toEqual([]);
    await p.reload();
    await expect(p.locator('.visit-video-thumb')).toHaveCount(2);
});
test('精简导出三按钮顺序、完整离线照片视频与两种复制回退', async ({ page: p, browser, browserName }, info) => {
    await enter(p);
    await p.getByRole('button', { name: '导出情况单', exact: true }).click();
    const d = p.getByRole('dialog', { name: '导出情况单', exact: true });
    await expect(d.getByRole('button')).toHaveText(['', '复制问诊提示词', '保存 HTML 情况单', '复制纯文本']);
    await expect(d.locator('input, details, textarea')).toHaveCount(0);
    const bounds = await d.boundingBox();
    expect(bounds!.height).toBeLessThan(400);
    expect(bounds!.width).toBeLessThanOrEqual(p.viewportSize()!.width);
    await p.screenshot({ path: info.outputPath('export-options.png') });
    const download = p.waitForEvent('download');
    await d.getByRole('button', { name: '保存 HTML 情况单', exact: true }).click();
    const filename = info.outputPath('offline-confirmed.html');
    await (await download).saveAs(filename);
    const html = await readFile(filename, 'utf8');
    expect(html).toContain('data:' + videoMime() + ';base64,');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('鸡蛋观察');
    for (const secret of ['Bearer', 'blob:', 'event-a', 'record:s7'])
        expect(html).not.toContain(secret);
    expect(html).not.toMatch(/<script/);
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' }), offline = await context.newPage(), attempts: string[] = [];
    if (browserName === 'webkit')
        await context.route(/^https?:/, r => { attempts.push(r.request().url()); return r.abort(); });
    else
        await context.setOffline(true);
    await offline.goto(pathToFileURL(filename).href);
    await expect(offline.getByRole('heading', { name: '完整原始依据', exact: true })).toBeVisible();
    await expect(offline.locator('.visit-copy-media img')).toHaveCount(2);
    expect((await offline.locator('.visit-copy-media figure').allTextContents()).map(text=>text.match(/\d{2} · (?:照片|视频) · [^\n]+?\.(?:png|mp4|webm)/)?.[0])).toEqual([
        expect.stringMatching(/^01 · 照片 · 测试原图-0/),
        expect.stringMatching(/^02 · 照片 · 测试原图-1/),
        expect.stringMatching(/^03 · 视频 · 合成可播放视频/),
    ]);
    const v = offline.locator('video');
    await verifyVideo(v, offline, true);
    expect(attempts).toEqual([]);
    await offline.screenshot({ path: info.outputPath('offline-actual-playing.png') });
    await context.close();
    await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
    await d.getByRole('button', { name: '复制问诊提示词' }).click();
    const prompt = await d.getByLabel('可复制的问诊提示词').inputValue();
    expect(prompt).toContain('以下是已保存资料的整理内容');
    await d.getByRole('button', { name: '复制纯文本', exact: true }).click();
    const plain = await d.getByLabel('可复制的纯文本').inputValue();
    expect(prompt.endsWith(plain)).toBe(true);
    expect(plain).not.toContain('以下是已保存资料的整理内容');
    await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{writeText:async (text:string) => { (window as any).copied = text; }} }));
    await d.getByRole('button', { name: '复制纯文本', exact:true }).click();
    await expect.poll(() => p.evaluate(() => (window as any).copied)).toBe(plain);
    await expect(d.locator('textarea')).toHaveCount(0);
    await d.getByRole('button', { name: '复制问诊提示词', exact:true }).click();
    await expect.poll(() => p.evaluate(() => (window as any).copied)).toBe(prompt);
});
test('导出途中来源变化和主动取消均不生成过期文件', async ({ page: p }) => {
    await enter(p);
    await p.getByRole('button', { name: '导出情况单', exact: true }).click();
    const d = p.getByRole('dialog', { name: '导出情况单' }), url = '**/api/events/event-a/attachments/v5-image-0/content', downloads: string[] = [];
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(r => release = r), ready = new Promise<void>(r => started = r);
    p.on('download', d => downloads.push(d.suggestedFilename()));
    await p.route(url, async (r) => { started(); await gate; await r.continue().catch(() => { }); });
    await d.getByRole('button', { name: '保存 HTML 情况单' }).click();
    await ready;
    const created = await (await p.request.post('/api/events/event-a/records', { headers, data: { type: 'note', content: '导出竞态合成记录', occurredAt: '2026-09-01T10:00:00Z' } })).json();
    try {
        release();
        await expect(d).toHaveCount(0);
        await expect(p.getByRole('status')).toContainText('资料或版本已变化');
        expect(downloads).toEqual([]);
    }
    finally {
        await p.request.delete('/api/records/' + created.id, { headers });
        await p.unroute(url);
    }
    await update(p);
    await p.getByRole('button', { name: '导出情况单', exact: true }).click();
    let finish!: () => void, waiting!: () => void;
    const wait = new Promise<void>(r => finish = r), pending = new Promise<void>(r => waiting = r);
    await p.route(url, async (r) => { waiting(); await wait; await r.abort().catch(() => { }); });
    await d.getByRole('button', { name: '保存 HTML 情况单' }).click();
    await pending;
    await d.getByRole('button', { name: '关闭导出情况单' }).click();
    finish();
    await expect(d).toHaveCount(0);
    expect(downloads).toEqual([]);
});
test('相册上传失败重试、元数据真实保存与拍摄时间精度保留', async ({ page: p }, info) => {
    await enter(p);
    const picker = await photos(p), buffer = await (await p.request.get('/api/events/event-a/attachments/v5-image-0/content', { headers })).body();
    let failed = false;
    await p.route('**/api/quick-records/*/photos', r => { if (r.request().method() === 'POST' && !failed) {
        failed = true;
        return r.fulfill({ status: 503, json: { error: { message: '合成上传故障' } } });
    } return r.continue(); });
    await picker.getByLabel('选择要上传的影像').setInputFiles({ name: '本地上传.png', mimeType: 'image/png', buffer });
    await expect(picker.getByRole('alert')).toContainText('合成上传故障');
    await expect(picker.getByRole('button', { name: '保存影像选择' })).toBeDisabled();
    await picker.getByRole('button', { name: '重试上传' }).click();
    await expect(picker.getByText(/上传完成，待保存/)).toBeVisible();
    const choice = picker.locator('.visit-photo-choice').filter({ hasText: '本地上传.png' });
    await choice.getByText('编辑照片说明', { exact: true }).click();
    await choice.getByLabel('照片说明', { exact: true }).fill('上传测试 ' + info.project.name);
    await choice.getByLabel('部位 / 对象', { exact: true }).fill('前臂');
    await picker.getByRole('button', { name: '保存影像选择' }).click();
    await expect(picker).toHaveCount(0);
    const saved = await read(p), photo = saved.photos.find((p: any) => p.title === '上传测试 ' + info.project.name);
    expect(photo.capturedAt).toBeNull();
    expect(photo.location).toBe('前臂');
    const capturedAt = '2026-09-01T03:04:05.000Z';
    await p.request.put(endpoint, { headers, data: { expectedVersion: saved.version, requestId: crypto.randomUUID(), photoDetails: { [photo.sourceId]: { capturedAt, capturePrecision: 'exact' } } } });
    await p.reload();
    await photos(p);
    const item = picker.locator('.visit-photo-choice').filter({ hasText: photo.title });
    await item.getByText('编辑照片说明', { exact: true }).click();
    await item.getByLabel('照片说明', { exact: true }).fill(photo.title + ' 已核对');
    await picker.getByRole('button', { name: '保存影像选择' }).click();
    await expect(picker).toHaveCount(0);
    expect((await read(p)).photos.find((p: any) => p.sourceId === photo.sourceId).capturedAt).toBe(capturedAt);
});
test('取消面板后迟到上传清理且压缩取消重开不串照片', async ({ page: p }) => {
    await enter(p);
    const picker = await photos(p), buffer = await (await p.request.get('/api/events/event-a/attachments/v5-image-0/content', { headers })).body();
    let release!: () => void, uploaded!: () => void, draftId = '';
    const gate = new Promise<void>(r => release = r), ready = new Promise<void>(r => uploaded = r);
    await p.route('**/api/quick-records/*/photos', async (r) => { if (r.request().method() !== 'POST')
        return r.continue(); draftId = new URL(r.request().url()).pathname.split('/')[3]; const response = await r.fetch(); uploaded(); await gate; await r.fulfill({ response }).catch(() => { }); });
    await picker.getByLabel('选择要上传的影像').setInputFiles({ name: '迟到上传.png', mimeType: 'image/png', buffer });
    await ready;
    await picker.getByRole('button', { name: '关闭添加 / 调整影像' }).click();
    await picker.getByRole('button', { name: '放弃修改' }).click();
    release();
    await expect(picker).toHaveCount(0);
    await expect.poll(async () => { const r = await p.request.get('/api/quick-records/' + draftId + '/photos', { headers: { ...headers, 'X-Hoooho-Member-Id': 'child-a' } }); return (await r.json()).length; }).toBe(0);
    await p.unroute('**/api/quick-records/*/photos');
    await p.evaluate(() => { const original = HTMLCanvasElement.prototype.toBlob; let first = true; HTMLCanvasElement.prototype.toBlob = function (callback, ...args) { if (!first)
        return original.call(this, callback, ...args); first = false; original.call(this, blob => { (window as any).__releaseVisitCompression = () => callback(blob); }, ...args); }; });
    await photos(p);
    await picker.getByLabel('选择要上传的影像').setInputFiles({ name: '旧压缩.png', mimeType: 'image/png', buffer });
    await expect.poll(() => p.evaluate(() => typeof (window as any).__releaseVisitCompression)).toBe('function');
    await picker.getByRole('button', { name: '关闭添加 / 调整影像' }).click();
    await picker.getByRole('button', { name: '放弃修改' }).click();
    await photos(p);
    await picker.getByLabel('选择要上传的影像').setInputFiles({ name: '新面板.png', mimeType: 'image/png', buffer });
    await expect(picker.getByText(/上传完成，待保存/)).toBeVisible();
    await p.evaluate(() => (window as any).__releaseVisitCompression());
    await expect(picker.getByText(/旧压缩/)).toHaveCount(0);
});
test('只读用药详情一次展开，未确认未来不冒充实际执行，单周未来可核对', async ({ page: p }) => {
    await enter(p);
    const writes: string[] = [];
    p.on('request', r => { if (r.url().includes('/api/medication-reminders') && r.method() !== 'GET')
        writes.push(r.url()); });
    await chapter(p, '相关经过与处理');
    await p.getByRole('button',{name:'用药计划与使用记录',exact:true}).click();
    const med = p.locator('[data-readonly-reminder]');
    await expect(med).toHaveCount(1);
    await expect(med.getByRole('button', { name: /管理|归档|删除|撤回|已服用/ })).toHaveCount(0);
    await med.getByRole('button', { name: /未来计划/ }).first().click();
    await expect(p.getByRole('dialog', { name: '原始依据' })).toContainText('用药计划');
    await p.getByRole('dialog', { name: '原始依据' }).getByRole('button', { name: '关闭原始依据', exact: true }).click();
    expect(writes).toEqual([]);
    await p.route('**/api/members/child-a/visit-sheet', async (route) => { const response = await route.fetch(), state = await response.json(); if (state.report?.medicationReminders?.[0]) {
        const r = state.report.medicationReminders[0], future = new Date(Date.parse(state.report.generatedAt) + 86400000).toISOString();
        r.totalDays = 3;
        r.occurrences = r.occurrences.slice(0, 3).map((o: any, i: number) => ({ ...o, completed: false, scheduledAt: future, weekIndex: 0, dayIndex: i }));
    } await route.fulfill({ response, json: state }); });
    await p.reload();
    await chapter(p, '相关经过与处理');
    await p.getByRole('button',{name:'用药计划与使用记录',exact:true}).click();
    await expect(med.getByRole('button', { name: /未来计划/ })).toHaveCount(3);
});
test('读取超时中文提示重试恢复原版本', async ({ page: p }) => {
    await enter(p);
    const before = await read(p);
    await p.addInitScript(() => { const original = window.fetch.bind(window); let first = true; window.fetch = (input, init) => { if (first && String(input).endsWith('/visit-sheet')) {
        first = false;
        return Promise.reject(new DOMException('signal timed out', 'TimeoutError'));
    } return original(input, init); }; });
    await p.reload();
    await expect(p.getByText('情况单读取超时或连接中断，请重试。已有资料未修改。', { exact: true })).toBeVisible();
    await p.getByRole('button', { name: '重试', exact: true }).click();
    await expect(p.locator('#chapter-overview h1')).toBeVisible();
    expect((await read(p)).version).toBe(before.version);
});

test('自动读取最新保存资料，相关经过按摘要核对来源，手工问题不丢',async({page:p})=>{
  await enter(p);const before=await read(p)
  const response=await p.request.post('/api/events/event-a/records',{headers,data:{type:'note',content:'前臂发红，新增观察',occurredAt:'2026-09-21T10:00:00Z',journal:{categories:['symptom'],symptom:{symptomCategory:'skin',narrative:'前臂发红，新增观察',locations:[{id:'forearm',label:'前臂',locationNumber:1,locationLayer:'surface'}],descriptors:['发红']}}}})
  expect(response.ok()).toBeTruthy();const record=await response.json()
  try{
    await update(p);const after=await read(p);expect(after.version).toBeGreaterThan(before.version);expect(after.question).toBe(before.question)
    await expect(p.getByRole('button',{name:'更新情况单',exact:true})).toHaveCount(0)
    await expect(p.getByText('有新资料待同步')).toHaveCount(0)
    await chapter(p,'相关经过与处理');await expect(p.locator('#chapter-course')).toContainText('前臂发红，新增观察')
    await p.locator('#chapter-course .visit-reading-course-group').first().getByRole('button',{name:'查看来源',exact:true}).click()
    await expect(p.getByRole('dialog',{name:'原始依据'})).toContainText('前臂发红，新增观察')
  }finally{expect((await p.request.delete('/api/records/'+record.id,{headers})).ok()).toBeTruthy()}
})

test('首次打开三个默认问题，七条整行建议可追加编辑，空经过隐藏',async({page:p},info)=>{
  const created=await p.request.post('/api/members',{headers,data:{name:'问题编辑验收（虚构）',relationship:'child',gender:'female',birthday:'2024-01-01'}});expect(created.ok()).toBeTruthy();const member=await created.json();await enter(p,member.id)
  await expect(p.locator('#chapter-course')).toHaveCount(0)
  const d=await edit(p,'本次想问');const input=d.getByRole('textbox',{name:'本次想问',exact:true})
  expect((await input.inputValue()).split('\n').filter(Boolean)).toHaveLength(3)
  const choices=d.locator('.visit-question-suggestions button');await expect(choices).toHaveCount(7)
  const choice=await choices.first().innerText();await choices.first().click();expect(await input.inputValue()).toContain(choice)
  await input.fill((await input.inputValue())+'\n家长自行补充的问题')
  await width(p);await p.screenshot({path:info.outputPath('question-editor.png')})
  await d.getByRole('button',{name:'保存',exact:true}).click();await expect(d).toHaveCount(0)
  await p.reload();await expect(p.locator('#chapter-overview h1')).toBeVisible();await chapter(p,'本次想问');await expect(p.locator('#chapter-medication')).toContainText('家长自行补充的问题')
})

test('自动整理失败保留已确认内容，重试后才采用新资料',async({page:p})=>{
 await enter(p);const before=await read(p)
 const response=await p.request.post('/api/events/event-a/records',{headers,data:{type:'note',content:'前臂观察：重试后读取',occurredAt:'2026-09-21T11:00:00Z',journal:{categories:['symptom'],symptom:{symptomCategory:'skin',narrative:'前臂观察：重试后读取',locations:[{id:'forearm',label:'前臂',locationNumber:1,locationLayer:'surface'}],descriptors:[]}}}});expect(response.ok()).toBeTruthy();const record=await response.json()
 try{
  await p.route('**/api/members/child-a/visit-sheet',r=>r.request().method()==='PUT'?r.fulfill({status:503,json:{error:{message:'自动整理暂时失败'}}}):r.continue())
  await p.reload();await expect(p.getByText('自动整理暂时失败',{exact:true})).toBeVisible();await expect(p.locator('#chapter-overview h1')).toBeVisible();expect((await read(p)).version).toBe(before.version)
  await p.unroute('**/api/members/child-a/visit-sheet');await p.getByRole('button',{name:'重试',exact:true}).click();await expect(p.getByText('自动整理暂时失败',{exact:true})).toHaveCount(0);await expect(p.getByRole('button',{name:'编辑目前情况',exact:true})).toBeEnabled()
  expect((await read(p)).version).toBeGreaterThan(before.version);expect((await read(p)).question).toBe(before.question)
 }finally{expect((await p.request.delete('/api/records/'+record.id,{headers})).ok()).toBeTruthy()}
})
