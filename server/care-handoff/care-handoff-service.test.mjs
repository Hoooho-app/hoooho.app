import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CareHandoffService } from './care-handoff-service.mjs'
import { handoffRoute, handoffResult } from './api.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { AccountDataService } from '../account/account-data-service.mjs'

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'handoff-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const member = { id: 'child', accountId: 'parent', name: '宝宝', birthday: '2023-01-01', gender: 'female' }
  const events = [{ id: 'case', memberId: 'child', accountId: 'parent', title: '咳嗽', category: 'symptom', caseTracking: true }, { id: 'foreign', memberId: 'sibling', accountId: 'parent', title: '不可泄露' }]
  const records = [{ id: 'visit', accountId: 'parent', eventId: 'case', occurredAt: '2026-10-08T00:00:00Z', createdAt: '2026-10-08T00:00:00Z', journal: { visit: { doctorStatement: '按已录入安排服药，三天后复查。' } } }, { id: 'meal', accountId: 'parent', eventId: 'case', occurredAt: '2026-10-09T00:00:00Z', createdAt: '2026-10-09T00:00:00Z', content: '今天实际吃饭时间不构成作息', journal: { diet: { foods: ['历史食物'] } } }]
  let sectionData = { sections: [] }
  const service = new CareHandoffService({ dataDirectory: directory, now: () => new Date('2026-10-09T10:00:00Z'), members: { findById: async id => id === member.id ? member : null }, events: { repository: { findByAccountId: async () => events } }, records: { findByAccountId: async () => records }, profiles: { read: async () => sectionData }, profileLists: { list: async () => ({ rows: [{ id: 'v1', name: '疫苗甲', date: '2026-09-01' }, { id: 'v2', name: '疫苗乙', displayName: '疫苗乙（第2剂）', date: '2026-10-01' }] }) } })
  return { service, directory, member, setSections: sections => { sectionData = { sections } } }
}
const section = (id, records, memberId = 'child') => ({ accountId: 'parent', memberId, sectionId: id, records })
const rows = (data, id) => data.sections.find(s => s.id === id).rows

test('only confirmed allergies become confirmed restrictions; explicit temporary restrictions keep their uncertainty', async t => {
  const f = await fixture(t)
  f.setSections([section('allergy', [{ name: '花生', currentStatus: 'confirmed' }, { name: '牛奶', currentStatus: 'suspected' }, { name: '鸡蛋', currentStatus: 'excluded' }, { name: '删除项', currentStatus: 'confirmed', profileListDeletedAt: 'now' }, { name: '同胞项', memberId: 'sibling', currentStatus: 'confirmed' }, { _allergyArchive: { items: [{ name: '尘螨', currentStatus: '医生确认' }] } }]), section('dietary-card', [{ items: [{ name: '牛奶', group: 'temporary' }] }]), section('chronic', [{ name: '湿疹', certainty: '医生明确', note: '已记录护理事项' }]), section('care', [{ name: '睡前检查皮肤' }])])
  const data = await f.service.preview('parent', 'child')
  assert.deepEqual(rows(data, 'restrictions').map(r => r.title), ['花生', '尘螨', '牛奶'])
  assert.match(rows(data, 'restrictions')[2].detail, /尚未确认/)
  assert.ok(rows(data, 'observations').some(r => r.title === '牛奶'))
  assert.ok(!JSON.stringify(data).includes('同胞项'))
  assert.equal(data.sections[0].id, 'medication')
  assert.match(rows(data, 'medication')[0].title, /三天后复查/)
  assert.equal(rows(data, 'routine').length, 0)
  assert.equal(rows(data, 'vaccination')[0].detail, '2026-10-01 · 疫苗乙（第2剂）')
  assert.equal(rows(data, 'vaccination')[1].detail, '尚未录入下一针安排。')
  assert.equal(rows(data, 'attention')[0].title, '睡前检查皮肤')
})

test('current routines and medication schedules preserve exact amounts and stop disabled or expired plans', async t => {
  const f = await fixture(t)
  const plan = { medicationName: '药甲', amount: 2.5, unit: 'ml', route: 'oral', mode: 'daily', times: ['08:00', '20:00'], startDate: '2026-10-01', endDate: '2026-10-12', timezone: 'Asia/Shanghai' }
  await f.service.medications.update(() => ({ reminders: [{ accountId: 'parent', memberId: 'child', status: 'active', plan }, { accountId: 'parent', memberId: 'child', status: 'active', plan: { ...plan, medicationName: '过期药', endDate: '2026-10-08' } }, { accountId: 'parent', memberId: 'child', status: 'archived', plan: { ...plan, medicationName: '归档药' } }] }))
  const rule = { accountId: 'parent', memberId: 'child', kind: 'sleep', revision: 1, timeZone: 'Asia/Shanghai', enabled: true, effectiveFrom: '2026-10-01', effectiveAt: '2026-09-30T16:00:00Z', slots: [{ id: 'nap', name: '午睡', time: '12:30', enabled: true, fields: { endTime: '14:00' } }] }
  await f.service.routines.update(() => ({ templates: [], dailyRules: [rule] }))
  const data = await f.service.preview('parent', 'child')
  assert.match(rows(data, 'medication')[0].detail, /每次 2.5ml.*口服.*08:00、20:00/)
  assert.ok(!JSON.stringify(data).includes('过期药'))
  assert.ok(!JSON.stringify(data).includes('归档药'))
  assert.match(rows(data, 'routine')[0].detail, /12:30—14:00/)
  await f.service.routines.update(() => ({ templates: [], dailyRules: [rule, { ...rule, revision: 2, enabled: false, effectiveFrom: '2026-10-10', effectiveAt: '2026-10-09T09:00:00Z' }] }))
  assert.equal(rows(await f.service.preview('parent', 'child'), 'routine').length, 0)
})

test('sharing is explicit, scoped, immutable, and rejects changed content', async t => {
  const f = await fixture(t)
  await assert.rejects(f.service.preview('stranger', 'child'), { status: 404 })
  const preview = await f.service.preview('parent', 'child')
  assert.equal((await f.service.shares.read()).shares.length, 0)
  await assert.rejects(f.service.share('parent', 'child', {}), { status: 400 })
  await assert.rejects(f.service.share('stranger', 'child', preview), { status: 404 })
  const { path: link } = await f.service.share('parent', 'child', preview)
  const token = link.split('/').at(-1)
  assert.equal((await f.service.shares.read()).shares[0].tokenHash.length, 64)
  assert.ok(!JSON.stringify(await f.service.shares.read()).includes(token))
  assert.deepEqual(await f.service.shared(token), preview)
  f.setSections([section('care', [{ title: '新的注意事项' }])])
  await assert.rejects(f.service.share('parent', 'child', preview), { code: 'CARE_HANDOFF_CHANGED', status: 409 })
  assert.deepEqual(await f.service.shared(token), preview)
  assert.ok(!JSON.stringify(await f.service.shared(token)).includes('accountId'))
  await assert.rejects(f.service.shared('invalid'), { status: 404 })
  await new AccountDataService({ dataDirectory: f.directory }).deleteAccount('parent')
  await assert.rejects(f.service.shared(token), { status: 404 })
})

test('a failed source read prevents partial sharing; routes enforce methods', async t => {
  const f = await fixture(t)
  f.service.profileLists.list = async () => { throw new Error('storage failure') }
  await assert.rejects(f.service.preview('parent', 'child'), /storage failure/)
  assert.equal((await f.service.shares.read()).shares.length, 0)
  assert.deepEqual(handoffRoute('/api/members/child/care-handoff/share'), { memberId: 'child', share: true })
  await assert.rejects(handoffResult(f.service, null, { shared: 'token' }, 'POST'), { status: 405 })
})

test('client capability publishes only on click, retries are idempotent, and collisions cannot cross accounts', async t => {
  const f = await fixture(t), preview = await f.service.preview('parent', 'child')
  const token = 'abcdefghijklmnopqrstuvwx01234567'
  await assert.rejects(f.service.shared(token), { status: 404 })
  await assert.rejects(f.service.share('parent', 'child', { ...preview, token: 'invalid' }), { status: 400 })
  const input = { fingerprint: preview.fingerprint, token }
  const result = await f.service.share('parent', 'child', input)
  assert.equal(result.path, `/care-handoff/shared/${token}`)
  assert.deepEqual(await f.service.shared(token), preview)
  assert.deepEqual(await f.service.share('parent', 'child', input), result)
  assert.equal((await f.service.shares.read()).shares.length, 1)
  await assert.rejects(f.service.share('stranger', 'child', input), { status: 404 })
  await assert.rejects(f.service.share('parent', 'child', { ...input, fingerprint: 'a'.repeat(64) }), { status: 409 })
  const freshToken = 'ABCDEFGHIJKLMNOPQRSTUVWX01234567'
  f.setSections([section('care', [{ title: '变更内容' }])])
  await assert.rejects(f.service.share('parent', 'child', { ...input, token: freshToken }), { code: 'CARE_HANDOFF_CHANGED' })
  await assert.rejects(f.service.shared(freshToken), { status: 404 })
})
