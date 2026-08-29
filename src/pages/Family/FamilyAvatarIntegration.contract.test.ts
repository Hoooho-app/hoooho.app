import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const addSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const firstSource = readFileSync(new URL('../ProfileSetup/index.tsx', import.meta.url), 'utf8')

test('first-use and later family creation reuse the same componentized avatar editor', () => {
  for (const source of [firstSource, addSource]) {
    assert.match(source, /<FamilyAvatarEditor/)
    assert.match(source, /createClayAvatarConfig/)
    assert.match(source, /serializeClayAvatar/)
    assert.match(source, /avatarMode === 'photo'/)
  }
})
