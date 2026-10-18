import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { CareJourneyService } from '../server/care-journey/service.mjs';
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-observation-browser-'));
const output = path.resolve('.codex-tmp/food-observation-browser'); await mkdir(output, { recursive: true });
const port = 15267, origin = `http://127.0.0.1:${port}`, errors = [], logs = [];
const server = spawn(process.execPath, ['server/app.mjs'], { env: { ...process.env, DATA_DIRECTORY: dataDirectory, AUTH_TOKEN_SECRET: randomUUID(), PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', RAILWAY_ENVIRONMENT_ID: '', AI_PROVIDER: 'local', OPENAI_API_KEY: '', BAILIAN_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', data => logs.push(data.toString())); server.stderr.on('data', data => logs.push(data.toString()));
let browser;
const report = { physicalIPhone: 'NOT_VERIFIED', mode: 'real Chromium, mobile emulation', checks: [], status: 'FAILED' };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(origin + '/api/health')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  let token = '';
  async function api(url, method = 'GET', data) { const response = await context.request.fetch(url, { method, data, headers: token ? { Authorization: `Bearer ${token}` } : {} }); const json = await response.json(); if (!response.ok()) throw new Error(`${method} ${url}: ${response.status()} ${json.error?.code} ${json.error?.message}`); return json; }
  const auth = await api('/api/auth/register', 'POST', { nickname: 'obqa' + randomUUID().replaceAll('-', '').slice(0, 10), password: randomUUID(), idempotencyKey: randomUUID() }); token = auth.token;
  const member = await api('/api/members', 'POST', { name: '观察验收（虚构）', relationship: 'child', birthday: '2024-01-01', gender: 'female' });
  await api('/api/auth/current-member', 'POST', { memberId: member.id });
  // Local isolated fixture only. Never seed wallets in a deployed environment.
  const care = new CareJourneyService({ dataDirectory }); await care.get(auth.user.id);
  await care.store.update(data => ({ ...data, accounts: data.accounts.map(a => a.accountId === auth.user.id ? { ...a, wallet: 100, lifetime: 100 } : a) }));
  await page.addInitScript(({ token, accountId, memberId }) => { sessionStorage.setItem('hoooho-auth-token', token); localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [], profile: null }, version: 5 })); }, { token, accountId: auth.user.id, memberId: member.id });
  await page.goto('/nurse-station');
  const menu = page.getByRole('button', { name: /打开.*(菜单|侧边栏)|菜单|打开导航/ }).first();
  if (await menu.count()) await menu.click(); else await page.locator('.nurse-station-header button').first().click();
  await page.getByRole('button', { name: '辅助工具' }).click();
  await page.getByRole('button', { name: '排敏观察', exact: true }).click();
  await expect(page).toHaveURL(/food-observations/); await expect(page.getByRole('heading', { name: '排敏观察', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '解锁', exact: true })).toBeVisible(); report.checks.push('sidebar > auxiliary tools > observation');
  await page.getByRole('button', { name: '解锁', exact: true }).click(); await page.getByRole('button', { name: '确认解锁 · 30个树芽' }).click();
  await expect(page.getByText('排敏观察已解锁', { exact: true })).toBeVisible();
  let state = await api('/api/food-observations?memberId=' + member.id); assert.equal(state.entitlement.balance, 70); assert.equal(state.automatic, false); report.checks.push('real tree-sprout unlock: 30 once, automatic remains opt-in');
  await page.getByRole('switch', { name: '自动观察新食物' }).click(); await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '添加食物观察', exact: true }).first().click();
  await page.getByLabel('食物名称', { exact: true }).fill('南瓜');
  const old = new Date(Date.now() - 4 * 86400000); const local = new Date(old.getTime() + 8 * 3600000).toISOString().slice(0, 16);
  await page.getByLabel(/^实际进食时间/).fill(local);
  await page.getByRole('button', { name: '保存食用记录并开始观察' }).click();
  await expect(page.getByRole('heading', { name: '南瓜', exact: true })).toBeVisible();
  const card = page.locator('.observation-card').filter({ has: page.getByRole('heading', { name: '南瓜', exact: true }) });
  await expect(card.getByRole('button', { name: /设置南瓜观察时间/ })).toHaveText('4／7天');
  assert.match(await card.locator('.observation-time').innerText(), /月.*日至.*月.*日/);
  assert.equal(await card.getByText('时间进度', { exact: true }).count(), 0); assert.equal(await card.locator('.observation-time').count(), 1);
  const color = await card.locator('.observation-days').evaluate(el => getComputedStyle(el).color); assert.equal(color, 'rgb(72, 98, 83)');
  assert.equal(await card.getByRole('progressbar').locator(':scope > span').count(), 7);
  await card.getByRole('button', { name: /设置南瓜观察时间/ }).click(); await page.getByRole('button', { name: '3天', exact: true }).click(); await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(card.getByRole('button', { name: /设置南瓜观察时间/ })).toHaveText('3／3天'); await expect(card.getByText('待回访', { exact: true })).toBeVisible(); report.checks.push('date range and clickable green fraction share one row; 7 segments; independent timing edits; due is not a success claim');
  await card.getByRole('button', { name: '确认这段时间的情况' }).click();
  await page.getByRole('radio', { name: '记不清', exact: true }).check(); await page.getByRole('radio', { name: '不确定', exact: true }).check(); await page.getByRole('button', { name: '保存回访并生成汇总' }).click();
  await page.getByRole('button', { name: /已汇总／结束/ }).click(); await page.getByRole('button', { name: '查看观察汇总' }).click();
  await expect(page.getByRole('heading', { name: '第1轮 · 信息不足，保留观察' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '下载汇总', exact: true }).click(); const download = await downloadPromise; assert.match(download.suggestedFilename(), /排敏观察-南瓜/);
  await page.screenshot({ path: output + '/summary-390.png', fullPage: true }); report.checks.push('two-question followup; unknown produces information-poor summary; downloadable fixed summary');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: /^待排查/ }).click();
  await api('/api/quick-records', 'POST', { memberId: member.id, idempotencyKey: randomUUID(), title: '胡萝卜食用记录', content: '吃了胡萝卜两小勺', inputChannel: 'text', occurredAt: new Date().toISOString(), journal: { categories: ['diet'], timePrecision: 'exact', diet: { kind: 'complementary', foods: ['胡萝卜'], amount: '两小勺' } } });
  await expect.poll(async () => JSON.parse(await readFile(path.join(dataDirectory, 'food-observations.json'), 'utf8')).observations.some(item => item.memberId === member.id && item.name === '胡萝卜')).toBe(true);
  report.checks.push('background reconciliation persisted the new food before reopening the observation page');
  await page.reload(); await expect(page.getByRole('heading', { name: '胡萝卜', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /设置胡萝卜观察时间/ }).click(); await page.getByLabel(/^观察天数/).fill('30'); await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.observation-card').getByRole('progressbar')).toHaveAttribute('max', '30');
  assert.equal(await page.locator('.observation-card').getByRole('progressbar').evaluate(el => el.tagName), 'PROGRESS');
  state = await api('/api/food-observations?memberId=' + member.id); assert.equal(state.items.find(i => i.name === '南瓜').days, 3); assert.equal(state.items.find(i => i.name === '胡萝卜').days, 30);
  await page.getByRole('switch', { name: '自动观察新食物' }).click(); await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false'); report.checks.push('ordinary saved diet starts automatic observation; long duration uses continuous progress; toggling off preserves observations');
  for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `viewport overflow ${width}`); await page.screenshot({ path: output + `/list-${width}.png`, fullPage: true }); }
  await page.getByRole('button', { name: /设置胡萝卜观察时间/ }).click(); await page.getByLabel(/^观察天数/).fill('0'); await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled(); await page.keyboard.press('Escape');
  assert.deepEqual(errors, []); report.checks.push('320/390 widths without overflow; invalid duration disabled; no runtime page errors'); report.status = 'PASS';
} catch (error) { report.error = error.message; if (browser) for (const context of browser.contexts()) for (const page of context.pages()) { await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {}); await writeFile(output + '/failure-ui.txt', await page.locator('body').innerText().catch(() => '')); } process.exitCode = 1; }
finally { if (browser) await browser.close(); server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); await writeFile(output + '/report.json', JSON.stringify({ ...report, pageErrors: errors }, null, 2)); await writeFile(output + '/server.log', logs.join('')); await rm(dataDirectory, { recursive: true, force: true }); console.log(JSON.stringify(report)); }
