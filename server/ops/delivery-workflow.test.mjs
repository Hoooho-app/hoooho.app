import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DeliveryWorkflowService } from './delivery-workflow.mjs'

test('configuration guidance is separate from receipts and cannot store a key or overwrite a later update', async t => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'ops-delivery-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const project = 'synthetic-ios'
  await mkdir(path.join(dataDirectory, 'ops'))
  await writeFile(path.join(dataDirectory, 'ops/delivery-catalog.json'), JSON.stringify({
    projects: [{ id: project, title: '合成项目', repository: 'example-org/example-ios', directory: 'iOS', trigger: 'cards',
      environment: 'testflight', uploadWorkflow: 'ios.yml', checkWorkflow: 'ios.yml', apiNames: ['EXAMPLE_ASC_KEY_ID', 'EXAMPLE_ASC_ISSUER_ID', 'EXAMPLE_ASC_API_KEY_P8'],
      variableNames: ['EXAMPLE_TEAM_ID', 'EXAMPLE_APP_ID'], signingNames: ['EXAMPLE_P12', 'EXAMPLE_PASSWORD', 'EXAMPLE_PROFILE'] }],
    observations: [{ project, step: 'apple-api-key', state: 'working', date: '2026-11-10', source: 'owner-report' }],
  }))
  const service = new DeliveryWorkflowService({ dataDirectory })
  const get = state => state.projects.find(p => p.id === project)
  const file = path.join(dataDirectory, 'ops/delivery-workflow-events.json')
  const initial = await service.read()
  assert.equal(get(initial).revision, 0)
  assert.equal(initial.observations[0].state, 'working')
  assert.equal(get(initial).setupProgress['apple-api-key'], undefined)
  await assert.rejects(readFile(file), { code: 'ENOENT' })
  const step = get(initial).setup.flatMap(group => group.steps).find(s => s.id === 'github-api-secrets')
  assert.deepEqual(step.fields.map(f => f.name), ['EXAMPLE_ASC_KEY_ID', 'EXAMPLE_ASC_ISSUER_ID', 'EXAMPLE_ASC_API_KEY_P8'])
  assert.match(step.location, /Environments → testflight → Secrets/)
  const payload = { action: 'record', project, requestId: randomUUID(), revision: 0, scope: 'setup', runId: null, step: step.id,
    state: 'blocked', reason: 'access', reference: null, confirmed: false }
  await assert.rejects(service.record({ ...payload, secret: 'DO_NOT_STORE_ME' }), { code: 'INVALID_DELIVERY_ENTRY' })
  await assert.rejects(service.record({ ...payload, reference: 'DO_NOT_STORE_ME' }), { code: 'INVALID_DELIVERY_ENTRY' })
  assert.equal(get(await service.record(payload)).revision, 1)
  assert.equal(get(await service.record(payload)).setupProgress[step.id].length, 1)
  await assert.rejects(service.record({ ...payload, requestId: randomUUID(), state: 'pending', reason: null }), { code: 'DELIVERY_REVISION_CONFLICT' })
  await assert.rejects(service.record({ ...payload, requestId: randomUUID(), revision: 1, state: 'confirmed', reason: null }), { code: 'INVALID_DELIVERY_ENTRY' })
  const updated = await service.record({ ...payload, requestId: randomUUID(), revision: 1, state: 'confirmed', reason: null, confirmed: true })
  assert.deepEqual(get(updated).setupProgress[step.id].map(x => x.state), ['blocked', 'confirmed'])
  assert.equal(updated.projects[0].revision, 0)
  assert.doesNotMatch(await readFile(file, 'utf8'), /DO_NOT_STORE_ME/)
  assert.deepEqual(get(await new DeliveryWorkflowService({ dataDirectory }).read()).setupProgress, get(updated).setupProgress)
})

test('every delivery round has independent receipts and a single build identity', async t => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'ops-delivery-round-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const service = new DeliveryWorkflowService({ dataDirectory })
  const project = 'hoooho'
  const create = (revision, version) => ({ action: 'start', project, requestId: randomUUID(), revision, version })
  const start = create(0, '1.0.1')
  const record = (step, reference, revision, extra = {}) => service.record({ action: 'record', project, requestId: randomUUID(), revision, scope: 'release', runId: start.requestId,
    step, state: 'confirmed', reason: null, reference, confirmed: true, ...extra })
  assert.equal((await service.record(start)).projects[0].runs[0].version, '1.0.1')
  await assert.rejects(record('upload', 'not-a-build', 1), { code: 'INVALID_DELIVERY_ENTRY' })
  await assert.rejects(record('distributed', '12.1', 1), { code: 'DELIVERY_PREREQUISITE' })
  await record('upload', '12.1', 1)
  await assert.rejects(record('processing', '12.2', 2), { code: 'DELIVERY_BUILD_CONFLICT' })
  await record('processing', '12.1', 2)
  await record('distributed', '12.1', 3)
  await record('device', '12.1', 4)
  const [current, previous] = (await service.record(create(5, '1.0.1'))).projects[0].runs
  assert.equal(current.build, null)
  assert.equal(current.steps.device, undefined)
  assert.equal(previous.build, '12.1')
  assert.equal(previous.steps.device[0].state, 'confirmed')
})
