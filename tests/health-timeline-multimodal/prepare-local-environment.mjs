import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UserRepository } from '../../server/auth/repositories/user-repository.mjs'
import { FamilyMemberService } from '../../server/members/family-member-service.mjs'
import { HealthEventService } from '../../server/events/health-event-service.mjs'
import { HealthEventRecordService } from '../../server/events/health-event-record-service.mjs'
import { HealthRecordOrganizationService } from '../../server/ai/health-record-organization-service.mjs'
import { cases } from './cases.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const artifacts = path.join(here, '.artifacts')
const dataDirectory = path.join(artifacts, 'data')
const sessionPath = path.join(artifacts, 'session.json')
const now = new Date()
const baselineTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

await rm(artifacts, { recursive: true, force: true })
await mkdir(dataDirectory, { recursive: true })

const users = new UserRepository(dataDirectory)
const user = await users.findOrCreateByEmail('timeline-e2e@example.invalid', now)
const members = new FamilyMemberService({ dataDirectory })
const member = await members.createSelf(user.id, {
  name: '多模态测试宝宝', birthday: '2023-08-31', gender: 'female', avatar: '👶'
}, now, 'Asia/Shanghai')
const organizations = new HealthRecordOrganizationService({ dataDirectory, structuredMode: 'enabled' })
const events = new HealthEventService({ dataDirectory, summaryRefresher: organizations })
const records = new HealthEventRecordService({ dataDirectory, organizations })

const quickEvents = {}
for (const item of cases.filter(({ caseId }) => caseId.startsWith('B'))) {
  const event = await events.create(user.id, { memberId: member.id, title: '', category: 'other', startTime: baselineTime.toISOString() }, now)
  await records.create(user.id, event.id, {
    type: 'symptom',
    content: item.caseId === 'B13' ? '刚才头痛' : '专项测试基线记录',
    occurredAt: baselineTime.toISOString(),
    sourceType: 'text_record'
  }, now)
  quickEvents[item.caseId] = event.id
}

const photoEvents = {}
for (const item of cases.filter(({ modality }) => modality === 'photo' || modality === 'photo_plus_audio')) {
  const event = await events.create(user.id, { memberId: member.id, title: '', category: 'other', startTime: baselineTime.toISOString() }, now)
  photoEvents[item.caseId] = event.id
}

await writeFile(sessionPath, JSON.stringify({ dataDirectory, email: user.email, loginCode: '123456', member, photoEvents, quickEvents }, null, 2))
console.info(`Prepared isolated local data at ${dataDirectory}`)
console.info(`Quick-record events: ${Object.keys(quickEvents).length}`)
console.info(`Photo/multimodal first-record events: ${Object.keys(photoEvents).length}`)
console.info(`Local login metadata: ${sessionPath}`)
