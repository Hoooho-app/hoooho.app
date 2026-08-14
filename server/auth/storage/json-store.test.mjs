import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { JsonStore } from './json-store.mjs'

test('JsonStore coalesces burst reads and refreshes its snapshot after updates', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-json-store-'))
  const file = path.join(directory, 'records.json')
  try {
    await writeFile(file, JSON.stringify({ records: [{ id: 'one' }] }), 'utf8')
    const store = new JsonStore(file, { records: [] })
    const snapshots = await Promise.all(Array.from({ length: 20 }, () => store.read()))

    assert.ok(snapshots.every((snapshot) => snapshot === snapshots[0]))
    assert.equal(Object.isFrozen(snapshots[0]), true)
    assert.equal(Object.isFrozen(snapshots[0].records), true)
    assert.equal(Object.isFrozen(snapshots[0].records[0]), true)

    const updated = await store.update((data) => ({ ...data, records: [...data.records, { id: 'two' }] }))
    assert.deepEqual(updated.records.map(({ id }) => id), ['one', 'two'])
    assert.equal(await store.read(), updated)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
