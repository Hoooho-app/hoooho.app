import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const addSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const firstSource = readFileSync(new URL('../ProfileSetup/index.tsx', import.meta.url), 'utf8')

test('first-use keeps adult avatars while later child creation uses the final child model', () => {
  assert.match(firstSource, /<FamilyAvatarEditor/)
  assert.match(firstSource, /createClayAvatarConfig/)
  assert.match(firstSource, /serializeClayAvatar/)
  assert.match(addSource, /<FamilyAvatarEditor/)
  assert.match(addSource, /createChildAvatarSelection/)
  assert.match(addSource, /serializeChildAvatar/)
  assert.match(addSource, /inferFamilyMemberRelationship\(birthday\) === 'child'/)
  for (const source of [firstSource, addSource]) assert.match(source, /avatarMode === 'photo'/)
})
