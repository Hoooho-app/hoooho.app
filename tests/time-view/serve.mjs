import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

process.chdir(path.resolve(import.meta.dirname, '../..'))
const shutdownMarker = path.resolve('.codex-tmp/time-view-shutdown')
await mkdir(path.dirname(shutdownMarker), { recursive: true })
await rm(shutdownMarker, { force: true })
setInterval(() => void access(shutdownMarker).then(() => process.exit()).catch(() => undefined), 200)
process.env.TZ = 'Asia/Shanghai'
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-time-view-'))
// Seed after the legacy one-time cleanup migration, as an already-initialized store.
await writeFile(path.join(dataDirectory, '.cleanup-test-data-2026-08-09-v1'), '{}')
const now = new Date()
const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)
const day = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
const accountId = 'time-view-test-account'
const base = { accountId, createdAt: now.toISOString(), updatedAt: now.toISOString() }
await writeFile(path.join(dataDirectory, 'users.json'), JSON.stringify({ users: [{ id: accountId, email: 'time-view@hoooho.test', createdAt: now.toISOString() }] }))
await writeFile(path.join(dataDirectory, 'family-members.json'), JSON.stringify({ members: ['child-one', 'child-two'].map((id, index) => ({ ...base, id, name: index ? '隔离对象' : '安安', gender: 'female', relationship: 'child', birthday: '2025-01-05', avatar: null, isSelf: false })) }))
const examples = [
  ['21:15', '身上突然起了一片疹子，有点痒', 'symptom'], ['20:40', '洗澡后涂了保湿霜', 'care'], ['19:10', '和小朋友一起玩了半小时', 'social'],
  ['18:30', '晚饭吃了米饭、鸡肉和西兰花', 'diet'], ['17:30', '去游泳，大约半小时', 'activity'], ['14:20', '午睡1小时20分钟', 'sleep'],
  ['13:10', '排便1次，颜色偏黄，较稀', 'elimination'], ['09:45', '按医嘱服用了药', 'medication'], ['09:30', '拿到了今天的检查报告', 'examination'], ['09:10', '去医院复诊', 'visit']
]
await writeFile(path.join(dataDirectory, 'health-events.json'), JSON.stringify({ events: [
  { ...base, id: 'event-one', memberId: 'child-one', title: '连续记录', category: 'other', status: 'observing', startTime: `${day}T09:10:00+08:00` },
  { ...base, id: 'event-two', memberId: 'child-two', title: '另一位孩子', category: 'other', status: 'observing', startTime: `${day}T09:10:00+08:00` }
] }))
await writeFile(path.join(dataDirectory, 'health-event-records.json'), JSON.stringify({ records: [
  ...examples.map(([clock, content, category], index) => ({ ...base, id: `record-${index}`, eventId: 'event-one', type: 'note', content, occurredAt: `${day}T${clock}:00+08:00`, sourceType: 'user_record', journal: { categories: [category] } })),
  { ...base, id: 'other-child-record', eventId: 'event-two', type: 'note', content: '隔离对象专属记录', occurredAt: `${day}T09:30:00+08:00` }
] }))
process.env.PORT = '4194'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'development'
process.env.DATA_DIRECTORY = dataDirectory
process.env.AUTH_TOKEN_SECRET = 'time-view-e2e-local-only-secret'
await import('../../server/app.mjs')
