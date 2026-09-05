import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { JsonStore } from './json-store.mjs'
import { accountTransaction, registerTransactionRoot } from './transaction.mjs'

test('failed disk commit restores earlier files and subsequent reads remain consistent', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hoooho-transaction-test-'))
  const rename = fs.rename
  try {
    const first = new JsonStore(path.join(directory, 'first.json'), { rows: [] })
    const second = new JsonStore(path.join(directory, 'second.json'), { rows: [] })
    await first.update(() => ({ rows: ['old-first'] }))
    await second.update(() => ({ rows: ['old-second'] }))
    let failed = false
    fs.rename = async (source, target) => {
      if (!failed && target === path.join(directory, 'second.json')) { failed = true; throw Object.assign(new Error('injected disk failure'), { code: 'EIO' }) }
      return rename(source, target)
    }
    syncBuiltinESMExports()
    await assert.rejects(accountTransaction(directory, async () => {
      await first.update(() => ({ rows: ['new-first'] }))
      await second.update(() => ({ rows: ['new-second'] }))
    }))
    assert.deepEqual((await first.read()).rows, ['old-first'])
    assert.deepEqual((await second.read()).rows, ['old-second'])
  } finally {
    fs.rename = rename; syncBuiltinESMExports()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('startup replays rollback journal before exposing data from an interrupted process', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hoooho-transaction-restart-'))
  try {
    await fs.writeFile(path.join(directory, 'records.json'), JSON.stringify({ rows: ['partial'] }))
    await fs.writeFile(path.join(directory, 'pending-account-transaction.json'), JSON.stringify({ pending: true, entries: [{ file: 'records.json', before: JSON.stringify({ rows: ['original'] }) }] }))
    registerTransactionRoot(directory)
    assert.deepEqual((await new JsonStore(path.join(directory, 'records.json'), { rows: [] }).read()).rows, ['original'])
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
