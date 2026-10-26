import test from 'node:test'
import assert from 'node:assert/strict'
import {cleanupSyntheticMember} from './synthetic-acceptance-cleanup.mjs'

const accountId = 'synthetic-account', memberId = 'fresh-member', fullRaw = '当前孩子的合成原话', draftId = 'exact-draft'
const missing = () => Object.assign(new Error('not found'), {status: 404})
const event = (id, owner = memberId) => ({id, accountId, memberId: owner})
const record = (id, eventId, patch = {}) => ({id, eventId, accountId, sourceText: fullRaw, aiProvenance: {draftId}, ...patch})

function fixture({events = [event('event-1')], records = [record('record-1', 'event-1')], hook} = {}) {
  const state = {
    members: new Map([[memberId, {id: memberId, accountId}], ['other-member', {id: 'other-member', accountId}]]),
    events: new Map(events.map(value => [value.id, structuredClone(value)])),
    records: new Map(records.map(value => [value.id, structuredClone(value)])),
    calls: [],
  }
  const api = async (route, method = 'GET', body) => {
    const call = {route, method, body}
    state.calls.push(call)
    await hook?.(call, state)
    if (route === '/api/events' && method === 'GET') return [...state.events.values()].map(value => structuredClone(value))
    let match
    if ((match = /^\/api\/members\/([^/]+)$/.exec(route))) {
      const id = decodeURIComponent(match[1])
      if (!state.members.has(id)) throw missing()
      if (method === 'DELETE') { state.members.delete(id); return {success: true} }
      return structuredClone(state.members.get(id))
    }
    if ((match = /^\/api\/events\/([^/]+)(\/records)?$/.exec(route))) {
      const id = decodeURIComponent(match[1])
      if (!state.events.has(id)) throw missing()
      if (match[2]) return [...state.records.values()].filter(value => value.eventId === id).map(value => structuredClone(value))
      // Intentionally allow unsafe parent deletion in the mock. Tests must
      // prove that the helper, rather than a server cascade, prevents orphans.
      if (method === 'DELETE') { state.events.delete(id); return {success: true} }
      return structuredClone(state.events.get(id))
    }
    if ((match = /^\/api\/records\/([^/]+)$/.exec(route))) {
      const id = decodeURIComponent(match[1])
      if (!state.records.has(id)) throw missing()
      if (method === 'DELETE') { state.records.delete(id); return {success: true} }
      return structuredClone(state.records.get(id))
    }
    throw new Error(`Unexpected local mock route: ${route}`)
  }
  return {state, run: (patch = {}) => cleanupSyntheticMember({api, memberId, accountId, fullRaw, draftId, saveAttempted: true, ...patch})}
}
const deletes = state => state.calls.filter(call => call.method === 'DELETE').map(call => call.route)

test('successful cleanup validates all records, deletes children first, and confirms all 404s', async () => {
  const f = fixture(), result = await f.run()
  assert.deepEqual(result, {recordsDeleted: 1, eventsDeleted: 1, eventRecordsEmpty: true, eventsGone: true, memberDeleted: true, memberGone: true, complete: true})
  assert.deepEqual(deletes(f.state), ['/api/records/record-1', '/api/events/event-1', '/api/members/fresh-member'])
  assert.equal(f.state.records.size, 0); assert.equal(f.state.events.size, 0)
  const firstDelete = f.state.calls.findIndex(call => call.method === 'DELETE')
  assert.ok(f.state.calls.slice(0, firstDelete).some(call => call.route === '/api/events/event-1/records'))
  assert.equal(f.state.calls.some(call => call.route.includes('logout')), false)
})

test('a failed record DELETE preserves its parent event and member', async () => {
  const f = fixture({hook: call => { if (call.method === 'DELETE' && call.route === '/api/records/record-1') throw new Error('network failed') }})
  const result = await f.run()
  assert.equal(result.complete, false)
  assert.deepEqual(deletes(f.state), ['/api/records/record-1'])
  assert.ok(f.state.events.has('event-1')); assert.ok(f.state.members.has(memberId)); assert.equal(f.state.records.size, 1)
})

test('extra duplicate-save events are discovered even when a first receipt was available', async () => {
  const f = fixture({events: [event('event-1'), event('duplicate-event')], records: [record('record-1', 'event-1'), record('duplicate-record', 'duplicate-event')]})
  const result = await f.run()
  assert.equal(result.complete, true); assert.equal(result.recordsDeleted, 2); assert.equal(result.eventsDeleted, 2)
  const firstDelete = f.state.calls.findIndex(call => call.method === 'DELETE')
  assert.ok(f.state.calls.slice(0, firstDelete).some(call => call.route === '/api/events/duplicate-event/records'))
  assert.equal(f.state.events.size, 0); assert.equal(f.state.records.size, 0)
})

test('another member event and its records are never read or deleted', async () => {
  const f = fixture({events: [event('event-1'), event('foreign-event', 'other-member')], records: [record('record-1', 'event-1'), record('foreign-record', 'foreign-event')]})
  const result = await f.run()
  assert.equal(result.complete, true)
  assert.ok(f.state.events.has('foreign-event')); assert.ok(f.state.records.has('foreign-record')); assert.ok(f.state.members.has('other-member'))
  assert.equal(f.state.calls.some(call => call.route.includes('foreign-') || call.route.includes('other-member')), false)
})

for (const [name, patch] of [['wrong original', {sourceText: '其他原话'}], ['wrong draft', {aiProvenance: {draftId: 'another-draft'}}]]) {
  test(`${name} in a later event blocks every DELETE, including earlier validated records`, async () => {
    const f = fixture({events: [event('event-1'), event('event-2')], records: [record('record-1', 'event-1'), record('record-2', 'event-2', patch)]})
    assert.equal((await f.run()).complete, false)
    assert.deepEqual(deletes(f.state), []); assert.equal(f.state.records.size, 2); assert.ok(f.state.members.has(memberId))
  })
}

test('saveAttempted=false proves no scoped events before deleting the empty member', async () => {
  const f = fixture({events: [event('foreign-event', 'other-member')], records: [record('foreign-record', 'foreign-event')]})
  const result = await f.run({saveAttempted: false, draftId: undefined, fullRaw: undefined})
  assert.equal(result.complete, true); assert.equal(result.eventRecordsEmpty, true); assert.equal(result.eventsGone, true)
  assert.deepEqual(deletes(f.state), ['/api/members/fresh-member'])
  assert.equal(f.state.calls[0].route, '/api/events'); assert.equal(f.state.events.size, 1)
})

test('saveAttempted=false retains unexpected scoped events and the member', async () => {
  const f = fixture()
  assert.equal((await f.run({saveAttempted: false})).complete, false)
  assert.deepEqual(deletes(f.state), []); assert.ok(f.state.members.has(memberId))
})

test('an attempted save with no event can clean the still-empty fresh member', async () => {
  const f = fixture({events: [], records: []})
  assert.equal((await f.run()).complete, true)
  assert.deepEqual(deletes(f.state), ['/api/members/fresh-member'])
})

for (const point of ['initial event scan', 'preflight record read', 'empty confirmation', 'final event scan']) {
  test(`network failure at ${point} never deletes the member`, async () => {
    let eventScans = 0, recordReads = 0
    const f = fixture({hook: call => {
      if (call.route === '/api/events' && call.method === 'GET') {
        eventScans++
        if (point === 'initial event scan' && eventScans === 1 || point === 'final event scan' && eventScans === 2) throw new Error('network failed')
      }
      if (call.route === '/api/events/event-1/records' && call.method === 'GET') {
        recordReads++
        if (point === 'preflight record read' && recordReads === 1 || point === 'empty confirmation' && recordReads === 2) throw new Error('network failed')
      }
    }})
    assert.equal((await f.run()).complete, false)
    assert.ok(f.state.members.has(memberId)); assert.equal(deletes(f.state).includes('/api/members/fresh-member'), false)
    if (point === 'initial event scan' || point === 'preflight record read') assert.deepEqual(deletes(f.state), [])
    if (point === 'empty confirmation') assert.ok(f.state.events.has('event-1'))
  })
}

test('an event arriving after preflight is preserved and prevents member deletion', async () => {
  let scans = 0
  const f = fixture({hook: (call, state) => {
    if (call.route === '/api/events' && call.method === 'GET' && ++scans === 2) {
      state.events.set('late-event', event('late-event'))
      state.records.set('late-record', record('late-record', 'late-event'))
    }
  }})
  assert.equal((await f.run()).complete, false)
  assert.ok(f.state.members.has(memberId)); assert.ok(f.state.events.has('late-event')); assert.ok(f.state.records.has('late-record'))
  assert.equal(deletes(f.state).some(route => route.includes('late-')), false)
})

test('a failed event DELETE preserves the member', async () => {
  const f = fixture({hook: call => { if (call.method === 'DELETE' && call.route === '/api/events/event-1') throw new Error('network failed') }})
  const result = await f.run()
  assert.equal(result.complete, false); assert.ok(f.state.members.has(memberId)); assert.ok(f.state.events.has('event-1'))
})

test('member deletion is not complete without a successful 404 confirmation', async () => {
  let deleted = false
  const f = fixture({hook: call => {
    if (call.route === '/api/members/fresh-member' && call.method === 'DELETE') deleted = true
    if (deleted && call.route === '/api/members/fresh-member' && call.method === 'GET') throw new Error('network failed')
  }})
  const result = await f.run()
  assert.equal(result.memberDeleted, true); assert.equal(result.memberGone, false); assert.equal(result.complete, false)
})

test('wrong member account fails the preflight without touching any object', async () => {
  const f = fixture(); f.state.members.get(memberId).accountId = 'another-account'
  assert.equal((await f.run()).complete, false); assert.deepEqual(deletes(f.state), [])
})

test('an already-absent member with no events is idempotently complete', async () => {
  const f = fixture({events: [], records: []}); f.state.members.delete(memberId)
  const result = await f.run()
  assert.equal(result.memberGone, true); assert.equal(result.memberDeleted, false); assert.equal(result.complete, true)
  assert.deepEqual(deletes(f.state), [])
})
