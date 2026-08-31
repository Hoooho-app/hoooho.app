import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UserRepository } from '../../server/auth/repositories/user-repository.mjs'
import { FamilyMemberService } from '../../server/members/family-member-service.mjs'
import { HealthEventService } from '../../server/events/health-event-service.mjs'
import { HealthEventRecordService } from '../../server/events/health-event-record-service.mjs'
import { formalCases, variantCases } from './cases.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const artifacts = path.join(here, '.artifacts')
const dataDirectory = path.join(artifacts, 'data')
const sessionPath = path.join(artifacts, 'session.json')
const now = new Date('2026-08-31T09:30:00+08:00')
const baselineTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

await rm(artifacts, { recursive: true, force: true })
await mkdir(dataDirectory, { recursive: true })

const users = new UserRepository(dataDirectory)
const user = await users.findOrCreateByEmail('oral-text-stress@example.invalid', now)
const memberService = new FamilyMemberService({ dataDirectory })
const self = await memberService.createSelf(user.id, { name: '口语压力测试本人', birthday: '1991-01-01', gender: 'female', avatar: '👩' }, now, 'Asia/Shanghai')
const child = await memberService.create(user.id, { name: '口语压力测试宝宝', birthday: '2022-08-31', gender: 'male', relationship: 'child', avatar: '👦' }, now, 'Asia/Shanghai')
const elder = await memberService.create(user.id, { name: '口语压力测试家人', birthday: '1958-01-01', gender: 'female', relationship: 'parent', avatar: '👵' }, now, 'Asia/Shanghai')
const members = { self, child, elder }

// Fixture baselines deliberately skip AI recomputation. The real browser/API path
// used by every formal case below still uses the production organization service.
const eventService = new HealthEventService({ dataDirectory })
const recordService = new HealthEventRecordService({
  dataDirectory,
  organizations: { invalidateAndRecompute: async () => undefined }
})
const events = {}

for (const item of [...formalCases, ...variantCases]) {
  const member = members[item.memberKey]
  const event = await eventService.create(user.id, { memberId: member.id, title: '', category: 'other', startTime: baselineTime.toISOString() }, now)
  await recordService.create(user.id, event.id, { type: 'symptom', content: `专项测试基线记录 ${item.caseId}`, occurredAt: baselineTime.toISOString(), sourceType: 'text_record' }, now)
  events[item.caseId] = { eventId: event.id, memberId: member.id }
  // Windows can briefly retain the atomic JSON rename handle; keep fixture
  // generation sequential and give the handle time to close between events.
  await new Promise((resolve) => setTimeout(resolve, 20))
}

await writeFile(sessionPath, JSON.stringify({
  dataDirectory,
  email: user.email,
  loginCode: '123456',
  timezone: 'Asia/Shanghai',
  members,
  events,
  formalCaseCount: formalCases.length,
  variantCaseCount: variantCases.length
}, null, 2))

console.info(`Prepared ${formalCases.length} formal and ${variantCases.length} variant cases in ${dataDirectory}`)
console.info(`Local login metadata: ${sessionPath}`)
