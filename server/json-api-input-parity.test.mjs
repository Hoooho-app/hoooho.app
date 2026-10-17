import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { TokenService } from './auth/token-service.mjs'
import { UserRepository } from './auth/repositories/user-repository.mjs'
import { FamilyMemberRepository } from './members/repositories/family-member-repository.mjs'
import { HealthEventService } from './events/health-event-service.mjs'
import { HealthProfileFactRepository } from './health-profile/repositories/health-profile-fact-repository.mjs'
import { aiApiPlugin } from './ai/vite-ai-plugin.mjs'
import { onlineConsultationsApiPlugin } from './consultations/vite-online-consultations-plugin.mjs'
import { healthProfileFactsApiPlugin } from './health-profile/vite-health-profile-facts-plugin.mjs'
import { healthInformationCandidatesApiPlugin } from './health-information/vite-health-information-candidates-plugin.mjs'
import { eventAttachmentsApiPlugin } from './events/vite-event-attachments-plugin.mjs'
import { foodLabelApiPlugin } from './food-label/vite-plugin.mjs'
import { visitSheetsApiPlugin } from './visit-sheets/vite-visit-sheets-plugin.mjs'
import { careHandoffApiPlugin } from './care-handoff/api.mjs'
import { childProfileListApiPlugin } from './health-profile/child-profile-list-api.mjs'

test('all remaining local JSON APIs reject non-object and malformed bodies before business mutation', async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-json-api-parity-'))
  const tokens = new TokenService('test-json-parity-secret', 60_000)
  const user = await new UserRepository(dataDirectory).createGuest('json-parity-user')
  const token = tokens.create(user)
  const member = await new FamilyMemberRepository(dataDirectory).create({ accountId: user.id, name: '测试孩子', relationship: 'child' })
  const event = await new HealthEventService({ dataDirectory }).create(user.id, { memberId: member.id, title: '皮疹记录', category: 'allergy' })
  const facts = new HealthProfileFactRepository(dataDirectory)
  const fact = await facts.create({ accountId: user.id, memberId: member.id, category: 'allergy', title: '已存在合法事实', description: '', status: 'confirmed', sources: [], firstObservedAt: '2026-09-01T00:00:00Z', notes: null })
  const options = { dataDirectory, tokenSecret: 'test-json-parity-secret', tokens }
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, plugins: [aiApiPlugin(options), onlineConsultationsApiPlugin(options), healthProfileFactsApiPlugin(options), healthInformationCandidatesApiPlugin(options), eventAttachmentsApiPlugin(options), foodLabelApiPlugin(options), visitSheetsApiPlugin(options), careHandoffApiPlugin(options), childProfileListApiPlugin(options)] })
  t.after(async () => { await server.close(); await rm(dataDirectory, { recursive: true, force: true }) })
  await server.listen()
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  const routes = [
    ['POST', `/api/members/${member.id}/symptom-preview`],
    ['PATCH', `/api/events/${event.id}/online-consultation`],
    ['PATCH', `/api/health-profile-facts/${fact.id}`],
    ['PATCH', '/api/health-information-candidates/missing-id'],
    ['POST', `/api/events/${event.id}/attachments/preview`],
    ['POST', '/api/food-label/check'],
    ['PUT', `/api/members/${member.id}/visit-sheet`],
    ['POST', `/api/members/${member.id}/care-handoff/share`],
    ['POST', `/api/members/${member.id}/profile-list/allergy`]
  ]
  for (const [method, route] of routes) for (const body of ['null', '[]', 'true', '"literal"', '{"broken":']) {
    const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: base }, body })
    const result = await response.json()
    assert.equal(response.status, 400, `${method} ${route} body=${body}: ${JSON.stringify(result)}`)
  }
  const response = await fetch(base + `/api/health-profile-facts/${fact.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: '合法备注仍能正常保存' }) })
  assert.equal(response.status, 200)
  assert.equal((await facts.findById(fact.id)).notes, '合法备注仍能正常保存')
})
