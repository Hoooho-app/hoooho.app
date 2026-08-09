import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { cleanupTestDataOnce } from './cleanup-test-data.mjs'

async function writeJson(filePath, value) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(filePath, JSON.stringify(value), 'utf8')
}

test('一次性清理保留账号本人并删除测试成员、事件和记录', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-cleanup-'))
  await writeJson(path.join(directory, 'family-members.json'), { members: [
    { id: 'self', accountId: 'account', name: '张三', isSelf: true, gender: 'male', birthday: '1990-01-01', avatar: 'old' },
    { id: 'child', accountId: 'account', name: '小明', isSelf: false }
  ] })
  await writeJson(path.join(directory, 'health-events.json'), { events: [{ id: 'event' }] })
  await writeJson(path.join(directory, 'health-event-records.json'), { records: [{ id: 'record' }] })

  const first = await cleanupTestDataOnce(directory)
  const second = await cleanupTestDataOnce(directory)
  const members = JSON.parse(await readFile(path.join(directory, 'family-members.json'), 'utf8'))
  const events = JSON.parse(await readFile(path.join(directory, 'health-events.json'), 'utf8'))
  const records = JSON.parse(await readFile(path.join(directory, 'health-event-records.json'), 'utf8'))

  assert.equal(first.applied, true)
  assert.equal(second.applied, false)
  assert.deepEqual(members.members.map((member) => member.id), ['self'])
  assert.equal(members.members[0].name, '我')
  assert.equal(members.members[0].birthday, null)
  assert.deepEqual(events.events, [])
  assert.deepEqual(records.records, [])
})
