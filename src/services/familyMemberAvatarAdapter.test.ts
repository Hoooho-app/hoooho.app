import assert from 'node:assert/strict'
import test from 'node:test'
import type { FamilyMemberApiDto } from '../types/index.ts'
import { parseClayAvatar } from '../utils/clayAvatar.ts'
import { adaptFamilyMember } from './healthEventDetailAdapter.ts'

const baseMember: FamilyMemberApiDto = {
  id: 'member-legacy', accountId: 'account-1', name: '旧成员', relationship: 'other',
  gender: 'female', birthday: '1990-12-22', avatar: null, isSelf: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
}

test('legacy members without an avatar receive a stable clay fallback while photos remain unchanged', () => {
  const first = adaptFamilyMember(baseMember)
  const second = adaptFamilyMember(baseMember)
  assert.ok(parseClayAvatar(first.avatar))
  assert.equal(first.avatar, second.avatar)

  const photo = 'data:image/webp;base64,AAAA'
  assert.equal(adaptFamilyMember({ ...baseMember, avatar: photo }).avatar, photo)
})
