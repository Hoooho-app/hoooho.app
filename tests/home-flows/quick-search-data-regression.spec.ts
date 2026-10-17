import {test, expect} from '@playwright/test'
import {TokenService} from '../../server/auth/token-service.mjs'
import {randomUUID} from 'node:crypto'
const token = new TokenService('visit-sheet-e2e-secret', 3600000).create({id: 'visit-test'}), headers = {Authorization: `Bearer ${token}`}

for (const route of ['/quick-search', '/health-events/search']) {
  test(`search data regression: polarity, aliases and compound days at ${route}`, async ({page, request}) => {
    const response = await request.post('/api/members', {headers, data: {name: '检索回归（虚构）', relationship: 'child'}})
    expect(response.ok()).toBe(true); const memberId = (await response.json()).id
    try {
      const now = Date.now(), date = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(new Date(now)), midnight = Date.parse(date + 'T00:00:00+08:00')
      const elapsed = Math.max(0, now - midnight)
      const records = [
        {content: '发烧38.1℃', at: midnight - 2 * 86400000 + 8 * 3600000},
        {content: '发烧38.2℃', at: midnight - 86400000 + 8 * 3600000},
        {content: '发烧38.5℃', at: midnight + Math.min(60000, elapsed / 3)},
        {content: '今天没有发烧', at: midnight + Math.min(120000, elapsed * 2 / 3)},
      ]
      for (const record of records) {
        const saved = await request.post('/api/quick-records', {headers, data: {memberId, content: record.content, title: record.content, rawText: record.content, occurredAt: new Date(record.at).toISOString(), inputChannel: 'text', idempotencyKey: randomUUID(), journal: {categories: ['symptom'], timePrecision: 'exact'}}})
        expect(saved.ok(), await saved.text()).toBe(true)
      }
      await page.addInitScript(({token, memberId}) => {sessionStorage.setItem('hoooho-auth-token', token); localStorage.setItem('hoooho-app', JSON.stringify({state: {authUser: {id: 'visit-test'}, currentMemberId: memberId, members: [], profile: null}, version: 5}))}, {token, memberId})
      let indexRequests = 0; const aiRequests: string[] = []
      page.on('request', request => {if (request.url().includes('/journal-index')) indexRequests++; if (/\/api\/(?:ai\/|members\/[^/]+\/(?:ai-drafts|recognition-jobs))/.test(request.url())) aiRequests.push(request.url())})
      await page.goto(route)
      const input = page.getByLabel('查找记录文字'), rows = page.locator('.journal-search-result')
      for (const query of ['最近一次发烧', '上次发热']) {await input.fill(query); await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText('38.5℃')}
      const initialIndexRequests = indexRequests
      await input.fill('今日发烧'); await expect(rows).toHaveCount(2); await expect(rows.first()).toContainText('38.5℃'); const today = await rows.allTextContents()
      await input.fill('今天发烧'); await expect(rows).toHaveText(today)
      for (const query of ['昨天和今天发烧', '今天或者昨天发烧', '昨日以及今日的发烧记录']) {await input.fill(query); await expect(rows).toHaveCount(3); await expect(rows.first()).toContainText('38.5℃'); await expect(rows.nth(1)).toContainText('38.2℃'); await expect(rows.last()).toContainText('没有发烧')}
      await input.fill('前天和今天发烧'); await expect(rows).toHaveCount(3); await expect(rows.nth(1)).toContainText('38.1℃'); expect((await rows.allTextContents()).join(' ')).not.toContain('38.2℃')
      expect(indexRequests).toBe(initialIndexRequests); expect(aiRequests).toEqual([])
    } finally {await request.delete('/api/members/' + memberId, {headers})}
  })
}
