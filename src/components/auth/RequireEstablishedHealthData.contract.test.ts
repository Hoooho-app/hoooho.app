import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const guard = read('./RequireEstablishedHealthData.tsx')
const router = read('../../app/router.tsx')

test('health profile requires a family member but not an existing health record', () => {
  assert.match(guard, /requireHealthRecord = true/)
  assert.match(guard, /entryState\.familyMemberCount > 0/)
  assert.match(guard, /!requireHealthRecord \|\| entryState\.hasValidHealthRecord/)
  assert.match(router, /<RequireEstablishedHealthData requireHealthRecord=\{false\} \/>[\s\S]*path: '\/health-profile'/)
})

test('health event detail retains the established-health-record guard', () => {
  assert.match(router, /element: <RequireEstablishedHealthData \/>[\s\S]*path: '\/health-events\/:eventId'/)
})
