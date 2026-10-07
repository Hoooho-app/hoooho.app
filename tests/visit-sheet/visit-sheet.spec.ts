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
async function chapter(p: Page, title: string) { await p.getByRole('button', { name: '章节目录', exact: true }).click(); const d = p.getByRole('dialog', { name: '章节目录' }); await expect(d.locator('nav button')).toHaveCount(4); await d.getByRole('button', { name: new RegExp(title) }).click(); await expect(d).toHaveCount(0); }
async function edit(p: Page, title: string) { await p.getByRole('button', { name: '编辑' + title, exact: true }).click(); return p.getByRole('dialog', { name: '编辑' + title, exact: true }); }
async function photos(p: Page) { await edit(p, '完整资料'); await p.getByRole('button', { name: '添加 / 调整影像', exact: true }).click(); return p.getByRole('dialog', { name: '添加 / 调整影像' }); }
async function scope(p: Page) { await edit(p, '完整资料'); await p.getByRole('button', { name: '调整 / 恢复资料范围', exact: true }).click(); return p.getByRole('dialog', { name: '本次资料范围', exact: true }); }
async function update(p: Page) { await p.getByRole('button', { name: '更新情况单', exact: true }).click(); const d = p.getByRole('dialog', { name: '更新情况单', exact: true }); await d.getByRole('button', { name: '整理并查看草稿', exact: true }).click(); await d.getByRole('button', { name: '确认替换情况单', exact: true }).click(); await expect(d).toHaveCount(0); }
async function sources(p: Page) { await chapter(p, '完整资料'); await p.getByText(/^原始记录 ·/).click(); }
async function fromHome(p: Page) {
    await p.goto('/nurse-station');
    await p.getByRole('link', { name: /^就诊情况单，/ }).click();
    await expect(p.locator('#chapter-overview h1')).toBeVisible();
}
test.beforeEach(async ({ page: p }) => { const s = await (await p.request.get(endpoint, { headers })).json(); expect((await p.request.put(endpoint, { headers, data: { expectedVersion: s.report?.version ?? s.expectedVersion ?? 0, requestId: crypto.randomUUID(), focus: { mode: 'source', sourceId: 'record:s7' }, caseDetails: {}, question: '', notes: {}, selection: null, selectedPhotoIds: ['attachment:v5-image-0', 'attachment:v5-image-1', 'attachment:' + videoId()] } })).ok()).toBeTruthy(); });
test('浏览器返回保护四项草稿，继续编辑和放弃均有明确结果', async ({page:p})=>{
    await enter(p);
    for (const [card,label] of [['本次情况','最近变化'],['本次想问','本次想问'],['经过与处理','经过与处理补充（已发生的情况）'],['完整资料','资料说明']]) {
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
    const d=await edit(p,'本次情况'),before=await read(p);
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
    await enter(p);const d=await edit(p,'本次情况');
    await d.getByRole('textbox',{name:'最近变化',exact:true}).fill('刷新保护的草稿');
    const nativeDialog=p.waitForEvent('dialog');
    const reload=p.evaluate(()=>location.reload());
    const dialog=await nativeDialog;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();await reload;
    await expect(d.getByRole('textbox',{name:'最近变化',exact:true})).toHaveValue('刷新保护的草稿');
    await d.getByRole('button',{name:'返回编辑本次情况'}).click();await d.getByRole('button',{name:'放弃修改'}).click();
});
test('未关联主诉直接选择相关记录，保持主诉与原始内容',async({page:p})=>{
    await enter(p);await p.getByRole('button',{name:'更改主诉',exact:true}).click();
    const focus=p.getByRole('dialog',{name:'更改主诉',exact:true});
    await focus.getByLabel('本次主诉（家长陈述）').fill('脖子红点');
    await focus.getByRole('button',{name:'保存',exact:true}).click();
    await expect(focus).toHaveCount(0);
    await expect(p.locator('#chapter-overview')).toContainText('尚未关联记录');
    await expect(p.locator('#chapter-overview .visit-reading-facts')).toHaveCount(0);
    await p.getByRole('button',{name:'选择相关记录',exact:true}).click();
    const d=p.getByRole('dialog',{name:'选择相关记录',exact:true});
    await d.getByRole('checkbox',{name:/肘窝皮肤发红，第1条观察/}).check();
    await d.getByRole('button',{name:'保存',exact:true}).click();
    await expect(d).toHaveCount(0);
    expect((await read(p)).focus.relatedSourceIds).toContain('record:s0');
    await expect(p.locator('#chapter-overview h1')).toHaveText('脖子红点');
    await expect(p.getByRole('button',{name:'查看原话',exact:true})).toBeEnabled();
    await p.reload();await expect(p.locator('#chapter-overview')).not.toContainText('尚未关联记录');
});
test('本次情况一键添加影像，用药详情一次展开并能核对依据返回',async({page:p},info)=>{
    await enter(p);await p.getByRole('button',{name:'添加影像',exact:true}).click();
    const picker=p.getByRole('dialog',{name:'添加 / 调整影像'});
    await expect(picker.getByRole('button',{name:'从相册添加'})).toBeVisible();
    await picker.getByRole('button',{name:'关闭添加 / 调整影像'}).click();
    await chapter(p,'经过与处理');await p.getByRole('button',{name:/^用药资料/}).click();
    const d=p.getByRole('dialog',{name:'用药资料',exact:true});
    await expect(d.locator('[data-readonly-reminder]').first()).toBeVisible();
    await expect(d.locator('.visit-med-weeks')).toHaveCount(0);
    await expect(d.locator('details.visit-chapter-details')).toHaveCount(0);
    await width(p);await p.screenshot({path:info.outputPath('medication-direct.png')});
    await d.getByRole('button',{name:'查看提醒计划依据'}).first().click();
    const evidence=p.getByRole('dialog',{name:'原始依据',exact:true});
    await expect(evidence).toBeVisible();await expect(d).not.toBeVisible();
    await p.keyboard.press('Escape');await expect(evidence).toHaveCount(0);await expect(d).toBeVisible();
    await d.getByRole('button',{name:'返回用药资料'}).click();
    await expect(p.getByRole('button',{name:/^用药资料/})).toBeFocused();
});
test('更新预览按卡片显示新增资料，原文按需展开且确认前旧版不变',async({page:p},info)=>{
    await enter(p);const before=await read(p);
    const response=await p.request.post('/api/events/event-a/records',{headers,data:{type:'note',content:'新增皮肤观察用于核对',occurredAt:'2026-09-21T10:00:00Z',journal:{categories:['symptom'],symptom:{symptomCategory:'skin',narrative:'新增皮肤观察用于核对',locations:[],descriptors:[]}}}});
    expect(response.ok()).toBeTruthy();const record=await response.json();
    try {
        await p.getByRole('button',{name:'更新情况单',exact:true}).click();
        const d=p.getByRole('dialog',{name:'更新情况单',exact:true});
        await d.getByRole('button',{name:'整理并查看草稿',exact:true}).click();
        await expect(d.locator('.visit-update-preview')).toBeVisible();
        await expect(d.locator('pre')).toHaveCount(0);
        await expect(d.getByRole('status')).toContainText(/资料新增 [1-9]/);
        await expect(d.locator('.visit-update-card').filter({hasText:'本次更新'})).toContainText('新增皮肤观察用于核对');
        const card=d.locator('.visit-update-card').filter({hasText:'本次更新'});
        await expect(card.locator('.visit-original').first()).not.toBeVisible();
        await card.locator('summary').first().click();await expect(card.locator('.visit-original').first()).toBeVisible();
        await width(p);await p.screenshot({path:info.outputPath('update-cards.png')});
        expect((await read(p)).version).toBe(before.version);
        await d.getByRole('button',{name:'返回更新情况单'}).click();
    } finally {expect((await p.request.delete('/api/records/'+record.id,{headers})).ok()).toBeTruthy()}
});
test('四卡片默认展开、独立编辑、目录键盘定位、实际全页截图无溢出', async ({ page: p }, info) => {
    const errors: string[] = [];
    p.on('pageerror', e => errors.push(e.message));
    await enter(p);
    await width(p);
    for (const [id, open] of [['overview', true], ['medication', false], ['course', false], ['sources', false]] as const)
        await expect(p.locator('#chapter-' + id + ' .visit-reading-toggle')).toHaveAttribute('aria-expanded', String(open));
    await expect(p.locator('.visit-reading-growth button')).toHaveCount(2);
    await expect(p.getByRole('button', { name: '更新情况单', exact: true })).toHaveCount(1);
    await p.screenshot({ path: info.outputPath('phone-final.png') });
    await p.locator('[data-scroll-container]').evaluate(e => { Object.assign((e as HTMLElement).style, { position: 'static', height: 'auto', overflow: 'visible' }); });
    await p.locator('.visit-report').evaluate(e => Object.assign((e as HTMLElement).style, { position:'static', overflow:'visible', height: 'auto', minHeight: '100vh' }));
    await p.locator('html,body,#root').evaluateAll(elements=>elements.forEach(e=>Object.assign((e as HTMLElement).style,{height:'auto',overflow:'visible'})));
    await p.screenshot({ path: info.outputPath('full-reader.png'), fullPage: true });
    await p.reload();
    await expect(p.locator('#chapter-overview h1')).toBeVisible();
    for (const title of ['本次想问', '经过与处理', '完整资料', '本次情况']) {
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
    for (const [card, label, value] of [['本次情况', '当前情况（家长补充）', '夜间抓挠，未测体温'], ['本次想问', '本次想问', '需要检查吗？\n如何护理？'], ['经过与处理', '经过与处理补充（已发生的情况）', '护理后变化未知'], ['完整资料', '资料说明', '完整资料保存标记']]) {
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
    expect(saved.notes.sources).toBe('完整资料保存标记');
    expect(await (await p.request.get('/api/events/event-a/records', { headers })).json()).toEqual(original);
    const d = await edit(p, '本次情况');
    await d.getByLabel('最近变化').fill('失败时保留草稿');
    await p.route('**/api/members/child-a/visit-sheet', r => r.request().method() === 'PUT' ? r.fulfill({ status: 503, json: { error: { message: '合成保存失败' } } }) : r.continue());
    await d.getByRole('button', { name: '保存', exact: true }).click();
    await expect(d.getByRole('alert')).toContainText('合成保存失败');
    await expect(d.getByLabel('最近变化')).toHaveValue('失败时保留草稿');
    expect((await read(p)).version).toBe(saved.version);
    await d.getByRole('button', { name: '返回编辑本次情况' }).click();
    await expect(d.getByText('还有未保存的内容')).toBeVisible();
        await expect(d.getByRole('alert').filter({hasText:'还有未保存的内容'})).toBeInViewport({ratio:1});
    await p.screenshot({ path: info.outputPath('edit-draft-protected.png') });
    await d.getByRole('button', { name: '放弃修改' }).click();
});
test('自填主诉明确关联真实症状，搜索不丢选择且不套无关病程', async ({ page: p }) => {
    await enter(p);
    await p.getByRole('button', { name: '更改主诉', exact: true }).click();
    const d = p.getByRole('dialog', { name: '更改主诉' });
    await d.getByLabel('本次主诉（家长陈述）').fill('脖子红点');
    await d.getByRole('checkbox', { name: /肘窝皮肤发红，第1条观察/ }).check();
    await d.getByRole('button', { name: '保存', exact: true }).click();
    await expect(p.locator('#chapter-overview h1')).toHaveText('脖子红点');
    await chapter(p, '经过与处理');
    await expect(p.locator('.visit-reading-course-row').filter({ hasText: '肘窝皮肤发红，第1条观察' })).toHaveCount(1);
    await expect(p.locator('.visit-reading-course-row').filter({ hasText: '前臂皮肤发红，第8条观察' })).toHaveCount(0);
    await p.reload();
    expect((await read(p)).focus.relatedSourceIds).toContain('record:s0');
    await p.getByRole('button', { name: '更改主诉', exact: true }).click();
    await d.getByRole('radio', { name: /^前臂皮肤发红，第8条观察/ }).check();
    await d.getByPlaceholder('搜索，例如：前臂、皮疹').fill('无匹配xyz');
    await expect(d.getByText(/没有匹配症状/)).toBeVisible();
    await d.getByRole('button', { name: '保存', exact: true }).click();
    await expect(p.locator('#chapter-overview h1')).toHaveText('前臂皮肤发红，第8条观察');
});
test('更新草稿取消失败旧版不变，显式确认保留人工补充', async ({ page: p }, info) => {
    await enter(p);
    const editor = await edit(p, '本次情况');
    await editor.getByLabel('当前情况（家长补充）').fill('保留人工补充');
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const before = await read(p);
    await p.getByRole('button', { name: '更新情况单', exact: true }).click();
    const d = p.getByRole('dialog', { name: '更新情况单', exact: true });
    await d.getByRole('button', { name: '整理并查看草稿' }).click();
    await expect(d.getByRole('button', { name: '确认替换情况单' })).toBeVisible();
    expect((await read(p)).version).toBe(before.version);
    await p.screenshot({ path: info.outputPath('update-candidate.png') });
    await d.getByRole('button', { name: '返回更新情况单' }).click();
    expect((await read(p)).version).toBe(before.version);
    await p.route('**/api/members/child-a/visit-sheet', r => r.request().method() === 'PUT' ? r.fulfill({ status: 503, json: { error: { message: '合成更新失败' } } }) : r.continue());
    await p.getByRole('button', { name: '更新情况单', exact: true }).click();
    await d.getByRole('button', { name: '整理并查看草稿' }).click();
    await expect(d.getByRole('alert')).toContainText('合成更新失败');
    expect((await read(p)).version).toBe(before.version);
    await d.getByRole('button', { name: '返回更新情况单' }).click();
    await p.unroute('**/api/members/child-a/visit-sheet');
    await update(p);
    expect((await read(p)).version).toBe(before.version + 1);
    await expect(p.locator('#chapter-overview')).toContainText('保留人工补充');
});
test('原始症状更正、剂量与体温结构化保存，待确认更新和追溯', async ({ page: p }, info) => {
    await enter(p);
    await sources(p);
    await p.getByPlaceholder('搜索原文、日期或来源').fill('肘窝皮肤发红，第1条观察');
    await p.locator('.visit-source-row').first().click();
    await p.getByRole('button', { name: '查看 / 修改原始记录' }).click();
    await p.getByRole('button', { name: '编辑症状记录', exact: true }).click();
    await p.getByRole('combobox', { name: '影响程度' }).selectOption('clear');
    await p.getByRole('textbox', { name: /症状备注/ }).fill('已核对 ' + info.project.name);
    await p.getByRole('dialog', { name: '编辑症状记录' }).getByRole('button', { name: '保存', exact: true }).click();
    const d = p.getByRole('dialog', { name: '更新情况单', exact: true });
    await expect(d).toBeVisible();
    await d.getByRole('button', { name: '整理并查看草稿' }).click();
    await d.getByRole('button', { name: '确认替换情况单' }).click();
    await expect(d).toHaveCount(0);
    await sources(p);
    await p.getByText(/^修改前后对照 ·/).click();
    await expect(p.locator('#chapter-sources')).toContainText('已核对 ' + info.project.name);
    const ids: string[] = [];
    try {
        for (const data of [{ type: 'medication', content: '结构化药物验收', occurredAt: '2026-09-01T08:00:00Z', journal: { categories: ['medication'], medication: { medicationName: '合成药品', amountValue: 1, amountUnit: 'mL', administrationRoute: 'oral' } } }, { type: 'note', sourceType: 'measurement', content: '结构化体温验收 37℃', occurredAt: '2026-09-01T09:00:00Z', journal: { categories: ['symptom'], symptom: { symptomCategory: 'fever', narrative: '结构化体温验收', locations: [], descriptors: [], symptomSpecificData: { currentTemperature: 37 } } } }]) {
            const r = await p.request.post('/api/events/event-a/records', { headers, data });
            expect(r.ok()).toBeTruthy();
            ids.push((await r.json()).id);
        }
        await p.reload();
        await expect(p.locator('#chapter-overview h1')).toBeVisible();
        await update(p);
        await sources(p);
        await p.getByPlaceholder('搜索原文、日期或来源').fill('结构化药物验收');
        await p.locator('.visit-source-row').first().click();
        await p.getByRole('button', { name: '查看 / 修改原始记录' }).click();
        await p.getByRole('spinbutton', { name: '本次用量' }).fill('2');
        await p.getByRole('button', { name: '保存记录', exact: true }).click();
        await d.getByRole('button', { name: '返回更新情况单' }).click();
        await chapter(p, '完整资料');
        await p.getByPlaceholder('搜索原文、日期或来源').fill('结构化体温验收');
        await p.locator('.visit-source-row').first().click();
        await p.getByRole('button', { name: '查看 / 修改原始记录' }).click();
        await p.getByRole('button', { name: '编辑症状记录', exact: true }).click();
        await p.getByRole('spinbutton', { name: '本次体温 ℃' }).fill('36.8');
        await p.getByRole('dialog', { name: '编辑症状记录' }).getByRole('button', { name: '保存', exact: true }).click();
        const records = await (await p.request.get('/api/events/event-a/records', { headers })).json();
        expect(records.find((r: any) => r.id === ids[0]).journal.medication.amountValue).toBe(2);
        expect(records.find((r: any) => r.id === ids[1]).journal.symptom.symptomSpecificData.currentTemperature).toBe(36.8);
    }
    finally {
        for (const id of ids)
            expect((await p.request.delete('/api/records/' + id, { headers })).ok()).toBeTruthy();
    }
});
test('资料范围倒置拒绝、预览确认撤销恢复全部与编号搜索', async ({ page: p }) => {
    await enter(p);
    const before = await read(p), s = await scope(p);
    await s.getByRole('radio', { name: '选择情况与时间', exact: true }).check();
    await s.locator('input[type=checkbox]').first().check();
    await s.getByLabel('开始时间（选填）').fill('2026-09-20T00:00');
    await s.getByLabel('结束时间（选填）').fill('2026-09-01T00:00');
    await expect(s.getByRole('alert')).toContainText('开始时间不能晚于结束时间');
    await expect(s.getByRole('button', { name: '预览范围变化' })).toBeDisabled();
    await s.getByLabel('开始时间（选填）').fill('2026-09-01T00:00');
    await s.getByLabel('结束时间（选填）').fill('2026-09-02T00:00');
    await s.getByRole('button', { name: '预览范围变化' }).click();
    await expect(s.getByRole('status')).toContainText('将纳入');
    expect((await read(p)).version).toBe(before.version);
    await s.getByRole('button', { name: '确认范围并更新情况单' }).click();
    await expect(s).toHaveCount(0);
    expect((await read(p)).sources.length).toBeLessThan(before.sources.length);
    await scope(p);
    await s.getByRole('button', { name: '撤销上一次范围调整' }).click();
    await expect(s).toHaveCount(0);
    expect((await read(p)).sources.length).toBe(before.sources.length);
    await scope(p);
    await s.getByRole('radio', { name: '全部可访问资料（恢复完整范围）', exact: true }).check();
    await s.getByRole('button', { name: '预览范围变化' }).click();
    await s.getByRole('button', { name: '确认范围并更新情况单' }).click();
    await expect(s).toHaveCount(0);
    await sources(p);
    await p.getByPlaceholder('搜索原文、日期或来源').fill((await read(p)).sources[0].code.toLowerCase());
    await expect(p.locator('.visit-source-row')).toHaveCount(1);
    await p.getByPlaceholder('搜索原文、日期或来源').fill('不存在XYZ');
    await expect(p.getByRole('status').filter({ hasText: /匹配 0/ })).toBeVisible();
    await width(p);
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
    await p.getByLabel('本次主诉（家长陈述）').fill('无关联自填主题');
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
test('当前确认版导出默认重点可选完整资料，实际离线照片视频、复制失败回退与打印', async ({ page: p, browser, browserName }, info) => {
    await enter(p);
    await p.getByRole('button', { name: '导出情况单', exact: true }).click();
    const d = p.getByRole('dialog', { name: '导出情况单', exact: true });
    await expect(d.getByRole('radio', { name: '本次就诊重点（默认）' })).toBeChecked();
    await d.getByRole('radio', { name: '情况单与完整资料', exact: true }).check();
    await d.getByRole('checkbox', { name: '附带原视频', exact: true }).check();
    await p.screenshot({ path: info.outputPath('export-options.png') });
    const download = p.waitForEvent('download');
    await d.getByRole('button', { name: '保存离线情况单（HTML）', exact: true }).click();
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
    await expect(d.getByLabel('可复制的当前范围文本')).toContainText('完整原始依据');
    if (info.project.name === 'desktop') {
        await d.getByRole('button', { name: '打印 / 另存 PDF' }).click();
        const frame = p.locator('iframe[title="打印情况单"]');
        await expect(frame).toHaveCount(1);
        const printable = await browser.newPage();
        await printable.setContent((await frame.getAttribute('srcdoc'))!);
        await printable.emulateMedia({ media: 'print' });
        await expect(printable.getByRole('heading', { name: '完整原始依据', exact: true })).toBeVisible();
        await printable.pdf({ path: info.outputPath('complete-print.pdf'), format: 'A4', printBackground: true });
        await printable.close();
    }
});
test('导出途中来源变化和主动取消均不生成过期文件', async ({ page: p }) => {
    await enter(p);
    await p.getByRole('button', { name: '导出情况单', exact: true }).click();
    const d = p.getByRole('dialog', { name: '导出情况单' }), url = '**/api/events/event-a/attachments/v5-image-0/content', downloads: string[] = [];
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(r => release = r), ready = new Promise<void>(r => started = r);
    p.on('download', d => downloads.push(d.suggestedFilename()));
    await p.route(url, async (r) => { started(); await gate; await r.continue().catch(() => { }); });
    await d.getByRole('button', { name: '保存离线情况单（HTML）' }).click();
    await ready;
    const created = await (await p.request.post('/api/events/event-a/records', { headers, data: { type: 'note', content: '导出竞态合成记录', occurredAt: '2026-09-01T10:00:00Z' } })).json();
    try {
        release();
        await expect(d.getByRole('status')).toContainText('资料或版本已变化');
        expect(downloads).toEqual([]);
    }
    finally {
        await p.request.delete('/api/records/' + created.id, { headers });
        await p.unroute(url);
    }
    await d.getByRole('button', { name: '返回导出情况单' }).click();
    await update(p);
    await p.getByRole('button', { name: '导出情况单', exact: true }).click();
    let finish!: () => void, waiting!: () => void;
    const wait = new Promise<void>(r => finish = r), pending = new Promise<void>(r => waiting = r);
    await p.route(url, async (r) => { waiting(); await wait; await r.abort().catch(() => { }); });
    await d.getByRole('button', { name: '保存离线情况单（HTML）' }).click();
    await pending;
    await d.getByRole('button', { name: '返回导出情况单' }).click();
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
    await chapter(p, '经过与处理');
    await p.getByRole('button',{name:/^用药资料/}).click();
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
    await chapter(p, '经过与处理');
    await p.getByRole('button',{name:/^用药资料/}).click();
    await expect(med.getByRole('button', { name: /未来计划/ })).toHaveCount(3);
});
test('25候选长主诉可核对放弃不保存、大字空资料可读', async ({ page: p }) => {
    await p.route('**/api/members/child-a/visit-sheet', async (route) => { const response = await route.fetch(), state = await response.json(); if (route.request().method() === 'GET' && state.report) {
        const r = state.report, photo = r.photos.find((p: any) => p.sourceId === 'attachment:v5-image-0'), source = r.sources.find((s: any) => s.id === photo.sourceId);
        r.complaint = '长主诉：' + '家长记录反复变化，需要核对发生时间。'.repeat(12);
        r.photos = Array.from({ length: 25 }, (_, i) => ({ ...photo, sourceId: 'stress:' + i, title: '候选原图-' + (i + 1) }));
        r.sources.push(...r.photos.map((p: any) => ({ ...source, id: p.sourceId, title: p.title })));
        r.photoCandidates = r.photos.map((p: any) => p.sourceId);
        r.selectedPhotoIds = r.photoCandidates.slice(0, 3);
    } await route.fulfill({ response, json: state }); });
    await enter(p);
    await width(p);
    const picker = await photos(p);
    await picker.getByRole('button', { name: '选择已有记录' }).click();
    await expect(picker.getByRole('checkbox')).toHaveCount(25);
    await picker.getByRole('checkbox', { name: '候选原图-25', exact: true }).check();
    await width(p);
    await picker.getByRole('button', { name: '关闭添加 / 调整影像' }).click();
    await picker.getByRole('button', { name: '放弃修改' }).click();
    await p.evaluate(() => document.documentElement.style.fontSize = '200%');
    await width(p);
    const c = await p.context().browser()!.newContext({ viewport: { width: 375, height: 667 } }), e = await c.newPage();
    await enter(e, 'empty-child');
    await expect(e.locator('.visit-photos')).toHaveCount(0);
    await expect(e.locator('.visit-reading-growth')).toContainText('未填写');
    await width(e);
    await c.close();
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
