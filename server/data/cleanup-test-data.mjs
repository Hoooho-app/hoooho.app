import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'

const migrationName = '.cleanup-test-data-2026-08-09-v1'
const knownTestNames = new Set(['小明', '老婆', '狗狗', '张三', '刘大壮', '妈妈', '爸爸'])

export async function cleanupTestDataOnce(dataDirectory) {
  const markerPath = path.join(dataDirectory, migrationName)
  try {
    await access(markerPath)
    return { applied: false }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const membersStore = new JsonStore(path.join(dataDirectory, 'family-members.json'), { members: [] })
  const eventsStore = new JsonStore(path.join(dataDirectory, 'health-events.json'), { events: [] })
  const recordsStore = new JsonStore(path.join(dataDirectory, 'health-event-records.json'), { records: [] })
  const organizationsStore = new JsonStore(path.join(dataDirectory, 'health-record-organizations.json'), { organizations: [] })
  const attachmentsStore = new JsonStore(path.join(dataDirectory, 'event-attachments.json'), { attachments: [] })

  const beforeMembers = await membersStore.read()
  const beforeEvents = await eventsStore.read()
  const beforeRecords = await recordsStore.read()
  const now = new Date().toISOString()

  const keptMembers = beforeMembers.members
    .filter((member) => member.isSelf)
    .map((member) => knownTestNames.has(member.name)
      ? { ...member, name: '我', gender: null, birthday: null, avatar: null, updatedAt: now }
      : member)

  await membersStore.update(() => ({ members: keptMembers }))
  await eventsStore.update(() => ({ events: [] }))
  await recordsStore.update(() => ({ records: [] }))
  await organizationsStore.update(() => ({ organizations: [] }))
  await attachmentsStore.update(() => ({ attachments: [] }))
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(markerPath, JSON.stringify({
    appliedAt: now,
    removedMembers: beforeMembers.members.length - keptMembers.length,
    removedEvents: beforeEvents.events.length,
    removedRecords: beforeRecords.records.length
  }), 'utf8')

  return {
    applied: true,
    removedMembers: beforeMembers.members.length - keptMembers.length,
    removedEvents: beforeEvents.events.length,
    removedRecords: beforeRecords.records.length
  }
}
