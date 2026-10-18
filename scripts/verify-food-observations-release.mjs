import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const [origin, commit] = process.argv.slice(2);
if (!['https://hooohoapp-staging.up.railway.app', 'https://hoooho.com'].includes(origin) || !/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Expected known deployment origin and full deployed SHA');
const target = origin.includes('staging') ? 'staging' : 'production';
const output = `.codex-tmp/food-observation-release-${target}`; await mkdir(output, { recursive: true });
const proxyUrl = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const proxy = proxyUrl ? { server: `${proxyUrl.protocol}//${proxyUrl.host}`, ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username), password: decodeURIComponent(proxyUrl.password) } : {}) } : undefined;
const browser = await chromium.launch({ proxy, args: ['--no-sandbox'] });
const sessionFile = `/tmp/hoooho-observation-release-${target}.json`;
let saved; try { saved = JSON.parse(await readFile(sessionFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const context = await browser.newContext({ baseURL: origin, ...(saved?.storageState ? { storageState: saved.storageState } : {}), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
const page = await context.newPage(); page.setDefaultTimeout(20000);
const errors = [], report = { target, commit, physicalIPhone: 'NOT_VERIFIED', checks: [], errors, status: 'FAILED' };
page.on('pageerror', error => errors.push(error.message));
let token = saved?.token ?? '', memberId = '';
async function rawApi(path, method = 'GET', data) { return context.request.fetch(path, { method, data, headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 35000 }); }
async function api(path, method = 'GET', data) { const res = await rawApi(path, method, data); const body = await res.json(); if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${body.error?.code}`); return body; }
try {
  assert.equal((await api('/api/health')).status, 'ok');
  if (!saved) { const session = await api('/api/auth/register', 'POST', { nickname: `obsqa${randomUUID().replaceAll('-', '').slice(0, 10)}`, password: randomUUID(), idempotencyKey: randomUUID() }); token = session.token; saved = { token, accountId: session.user.id, storageState: await context.storageState() }; await writeFile(sessionFile, JSON.stringify(saved), { mode: 0o600 }); }
  assert.equal((await api('/api/ai/audio/capabilities')).runtime.commit, commit); report.checks.push('health and exact deployed commit');
  memberId = (await api('/api/members', 'POST', { name: '观察线上验收（虚构）', relationship: 'child', birthday: '2024-01-01', gender: 'female' })).id;
  await api('/api/auth/current-member', 'POST', { memberId });
  await page.addInitScript(({ token, accountId, memberId }) => { sessionStorage.setItem('hoooho-auth-token', token); localStorage.setItem('hoooho-app', JSON.stringify({ state: { authUser: { id: accountId }, currentMemberId: memberId, members: [], profile: null }, version: 5 })); }, { token, accountId: saved.accountId, memberId });
  const before = await api('/api/food-observations?memberId=' + memberId);
  assert.equal(before.entitlement.available, true); assert.equal(before.entitlement.cost, 30); assert.equal(before.entitlement.durationDays, 30); assert.equal(before.automatic, false); assert.deepEqual(before.items, []);
  const catalogue = (await api('/api/care-journey/catalogue')).items.find(item => item.id === 'food-observation'); assert.equal(catalogue.type, 'term'); assert.equal(catalogue.destination, '/food-observations');
  const denied = await rawApi('/api/food-observations', 'POST', { memberId, name: '南瓜', hasEaten: false, days: 7, requestId: randomUUID() }); assert.equal(denied.status(), 403); assert.equal((await denied.json()).error.code, 'OBSERVATION_LOCKED');
  assert.equal((await api('/api/food-observations?memberId=' + memberId)).items.length, 0); report.checks.push('enabled 30-sprout/30-day catalogue; opt-in default; locked write rejected without data creation');
  await page.goto('/nurse-station', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: '打开菜单', exact: true }).click(); await page.getByRole('button', { name: '辅助工具', exact: true }).click(); await page.getByRole('button', { name: '排敏观察', exact: true }).click();
  await expect(page.getByRole('heading', { name: '排敏观察', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '解锁', exact: true })).toBeVisible();
  for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: `${output}/entry-${width}.png`, fullPage: true }); }
  await page.getByRole('button', { name: '解锁', exact: true }).click(); await expect(page.getByRole('button', { name: '确认解锁 · 30个树芽', exact: true })).toBeDisabled(); await page.keyboard.press('Escape');
  await page.reload(); await expect(page.getByRole('heading', { name: '排敏观察', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '解锁', exact: true })).toBeVisible(); report.checks.push('real signed-in mobile browser sidebar entry, 320/390 widths, unlock sheet and reload');
  assert.equal((await api('/api/food-observations?memberId=' + memberId)).entitlement.balance, before.entitlement.balance); assert.deepEqual(errors, []); report.status = 'PASS';
} catch (error) { errors.push(error.message); await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); process.exitCode = 1; }
finally {
  if (memberId) { try { await api('/api/members/' + memberId, 'DELETE'); report.cleanup = 'synthetic child and observation data removed'; } catch (error) { errors.push(error.message); report.status = 'FAILED'; process.exitCode = 1; } }
  report.paidFlow = 'Complete paid/automatic/followup flow verified in the isolated local production server; live smoke does not modify real wallets or patient data.';
  await writeFile(`${output}/acceptance.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); await browser.close();
}
