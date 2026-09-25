import { mkdtemp, writeFile, access, unlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { visitFixture } from '../../server/visit-sheets/fixtures.mjs'
import { buildOccurrences } from '../../server/medication-reminders/medication-reminder-service.mjs'
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-visit-e2e-'))
const shutdownFile = new URL('./.shutdown', import.meta.url)
await unlink(shutdownFile).catch(() => {})
setInterval(
  () =>
    access(shutdownFile)
      .then(() => process.exit(0))
      .catch(() => {}),
  250,
).unref()
const f = visitFixture(),
  now = new Date().toISOString(),
  accountId = f.member.accountId
const seed = async (file, data) =>
  writeFile(path.join(dataDirectory, file), JSON.stringify(data), 'utf8')
await seed('.cleanup-test-data-2026-08-09-v1', { fixture: true })
await seed('users.json', {
  users: [
    {
      id: accountId,
      email: 'visit@example.test',
      createdAt: now,
      updatedAt: now,
    },
  ],
})
await seed('family-members.json', {
  members: [
    { ...f.member, relationship: 'child', createdAt: now, updatedAt: now },
    {
      id: 'empty-child',
      accountId,
      name: '空资料（虚构）',
      gender: 'male',
      relationship: 'child',
      birthday: '2025-01-01',
      createdAt: now,
      updatedAt: now,
    },
  ],
})
await seed('health-events.json', {
  events: f.events.map((e) => ({
    ...e,
    accountId,
    status: 'observing',
    category: 'allergy',
    createdAt: now,
    updatedAt: now,
  })),
})
await seed('health-event-records.json', {
  records: f.records.map((r) => ({
    ...r,
    createdAt: r.createdAt || r.occurredAt,
    updatedAt: r.updatedAt || r.occurredAt,
  })),
})
await seed('growth-measurements.json', {
  measurements: f.growth.map((g) => ({
    ...g,
    accountId,
    createdAt: now,
    updatedAt: now,
  })),
})
await seed('medication-reminders.json', {
  reminders: f.reminders.map((r) => ({
    ...r,
    accountId,
    status: 'active',
    completions: r.occurrences
      .filter((o) => o.completed)
      .map((o, index) => ({
        ...o.completion,
        occurrenceId: buildOccurrences(r.id, {...r.plan, timezone:'Asia/Shanghai'})[index].id,
        scheduledAt: buildOccurrences(r.id, {...r.plan, timezone:'Asia/Shanghai'})[index].scheduledAt,
        completedAt: o.completion.actualTakenAt,
        undoneAt: null,
      })),
    plan: { ...r.plan, timezone: 'Asia/Shanghai' },
  })),
})
await seed('desensitization-tests.json', {
  tasks: f.tasks.map((t) => ({
    ...t,
    accountId,
    categoryKey: 'egg',
    categoryLabel: '鸡蛋',
    confidence: 'confirmed',
    version: 1,
    planVersions: [],
    updatedAt: now,
  })),
  records: f.tasks.flatMap((t) =>
    t.records.map((r) => ({
      ...r,
      accountId,
      taskId: t.id,
      version: 1,
      createdAt: r.occurredAt,
      updatedAt: r.occurredAt,
      withdrawnAt: null,
    })),
  ),
})
await seed('event-attachments.json', {
  attachments: f.attachments.map((a) => ({
    ...a,
    accountId,
    memberId: f.member.id,
    storageKey: 'missing-fixture.png',
  })),
})
process.env.DATA_DIRECTORY = dataDirectory
process.env.AUTH_TOKEN_SECRET = 'visit-sheet-e2e-secret'
process.env.PORT = '4196'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'development'
await import('../../server/app.mjs')
