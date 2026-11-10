import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { expiryCountdown, isExpiryDate } from '../../shared/workflow-expiry.mjs'
import { WorkflowExpiryService } from './workflow-expiry.mjs'

test('countdown follows Beijing calendar dates and an exact deadline when supplied', () => {
  const before = new Date('2030-04-01T15:59:59Z'), midnight = new Date('2030-04-01T16:00:00Z')
  assert.equal(expiryCountdown('2030-04-02', null, before).label, '还剩 1 天')
  assert.equal(expiryCountdown('2030-04-02', null, midnight).label, '今天到期')
  assert.equal(expiryCountdown('2030-04-02', '2030-04-01T16:00:00Z', midnight).label, '已到期')
  assert.equal(expiryCountdown('2030-04-01', null, midnight, true).label, '已过续订日 1 天')
  assert.equal(expiryCountdown(null, null, midnight).label, '—')
  assert.equal(isExpiryDate('2030-02-29'), false)
})

test('verified dates, build isolation, conflict and clearing survive reopening storage', async t => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'workflow-expiry-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  await mkdir(path.join(dataDirectory, 'ops'))
  const target = { asset: 'testflight-build', project: 'hoooho', version: '1.2.0', build: '18' }
  await writeFile(path.join(dataDirectory, 'ops/workflow-expiry-sources.json'), JSON.stringify([
    { ...target, date: '2030-04-20', exactAt: '2030-04-20T01:00:00Z', checkedOn: '2030-04-01' },
    { ...target, build: '19', date: null, exactAt: null, checkedOn: '2030-04-01' },
  ]))
  const service = new WorkflowExpiryService({ dataDirectory, now: () => new Date('2030-04-01T16:00:00Z') })
  const { records: [verified, unknown] } = await service.read()
  assert.equal(verified.source, 'platform')
  assert.equal(unknown.date, null)
  assert.equal(unknown.build, '19')
  const write = { ...target, date: '2030-04-25', revision: verified.revision }
  await assert.rejects(service.record({ ...write, project: 'other' }), { code: 'INVALID_WORKFLOW_EXPIRY' })
  await assert.rejects(service.record({ ...write, date: '2030-04-31' }), { code: 'INVALID_WORKFLOW_EXPIRY' })
  await assert.rejects(service.record({ ...write, ignored: 'not metadata' }), { code: 'INVALID_WORKFLOW_EXPIRY' })
  const outcomes = await Promise.allSettled([service.record(write), service.record({ ...write, date: '2030-04-27' })])
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'WORKFLOW_EXPIRY_CONFLICT')
  const updated = (await service.read()).records.find(row => row.build === '18')
  assert.equal(updated.source, 'manual')
  assert.equal(updated.exactAt, null)
  await service.record({ ...target, date: null, revision: updated.revision })
  const reopened = await new WorkflowExpiryService({ dataDirectory }).read()
  assert.equal(reopened.records.find(row => row.build === '18').date, null)
  assert.deepEqual(reopened.records.find(row => row.build === '19'), unknown)
})
