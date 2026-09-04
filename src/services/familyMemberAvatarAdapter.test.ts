import assert from 'node:assert/strict'
import test from 'node:test'
import type { FamilyMemberApiDto } from '../types/index.ts'
import { parseClayAvatar } from '../utils/clayAvatar.ts'
import { getChildAvatarAge, parseStoredChildAvatar } from '../utils/childAvatar.ts'
import { adaptFamilyMember } from './healthEventDetailAdapter.ts'

const baseMember: FamilyMemberApiDto = {
  id: 'member-legacy', accountId: 'account-1', name: '旧成员', relationship: 'other',
  gender: 'female', birthday: '1990-12-22', avatar: null, isSelf: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
}

test('adult members retain their clay fallback while photos remain unchanged', () => {
  const first = adaptFamilyMember(baseMember)
  const second = adaptFamilyMember(baseMember)
  assert.ok(parseClayAvatar(first.avatar))
  assert.equal(first.avatar, second.avatar)

  const photo = 'data:image/webp;base64,AAAA'
  assert.equal(adaptFamilyMember({ ...baseMember, avatar: photo }).avatar, photo)
})

test('child members use the new age-specific avatar and migrate legacy IDs safely', () => {
  const child = { ...baseMember, relationship: 'child' as const, birthday: '2023-05-12' }
  const age = getChildAvatarAge(child.birthday)
  const fallback = adaptFamilyMember({ ...child, avatar: null })
  assert.deepEqual(parseStoredChildAvatar(fallback.avatar), { age, gender: 'girl', variant: 'east-asian' })

  const preserved = adaptFamilyMember({ ...child, avatar: 'clay:v1:toddler-girl:african' })
  assert.deepEqual(parseStoredChildAvatar(preserved.avatar), { age, gender: 'girl', variant: 'african' })

  const unmappable = adaptFamilyMember({ ...child, avatar: 'clay:v1:toddler-girl:south-asian' })
  assert.deepEqual(parseStoredChildAvatar(unmappable.avatar), { age, gender: 'girl', variant: 'east-asian' })

  const photo = 'data:image/webp;base64,AAAA'
  assert.equal(adaptFamilyMember({ ...child, avatar: photo }).avatar, photo)
})
