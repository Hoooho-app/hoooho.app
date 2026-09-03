import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const addSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const routerSource = readFileSync(new URL('../../app/router.tsx', import.meta.url), 'utf8')

test('first-use and later child creation share the same complete child editor', () => {
  assert.match(addSource, /<FamilyAvatarEditor/)
  assert.match(addSource, /createClayAvatarConfig/)
  assert.match(addSource, /serializeClayAvatar/)
  assert.match(addSource, /avatarMode === 'photo'/)
  assert.match(routerSource, /path: '\/onboarding\/profile', element: <Navigate to="\/children\/new" replace/)
})
