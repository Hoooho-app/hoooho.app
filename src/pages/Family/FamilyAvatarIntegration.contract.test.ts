import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const addSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const editorSource = readFileSync(new URL('./EditFamilyMemberPage.tsx', import.meta.url), 'utf8')
const firstSource = readFileSync(new URL('../ProfileSetup/index.tsx', import.meta.url), 'utf8')

test('first-use keeps adult avatars while later child creation uses the final child model', () => {
  assert.match(firstSource, /<FamilyAvatarEditor/)
  assert.match(firstSource, /createClayAvatarConfig/)
  assert.match(firstSource, /serializeClayAvatar/)
  assert.match(addSource, /<EditFamilyMemberPage key="create" create onCreated=/)
  assert.match(editorSource, /<FamilyAvatarEditor/)
  assert.match(editorSource, /createChildAvatarSelection/)
  assert.match(editorSource, /serializeChildAvatar/)
  assert.match(editorSource, /relationship: 'child'/)
  for (const source of [firstSource, editorSource]) assert.match(source, /avatarMode === 'photo'/)
})
