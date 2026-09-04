import assert from 'node:assert/strict'
import test from 'node:test'
import type { FamilyMemberApiDto } from '../types'
import { familyMemberService } from './familyMembers'

const member: FamilyMemberApiDto = {
  id: 'cached-child',
  accountId: 'cached-account',
  name: '缓存宝宝',
  relationship: 'child',
  gender: 'female',
  birthday: '2026-09-04',
  avatar: 'clay:v1:baby-girl:east-asian',
  caregivers: ['mother'],
  otherRelative: '姨妈',
  otherCaregiver: '王老师',
  isSelf: false,
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z'
}

test('成员列表响应可供同一登录会话的编辑页立即复用', async (context) => {
  const originalFetch = globalThis.fetch
  let fetchCount = 0
  context.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async () => {
    fetchCount += 1
    return new Response(JSON.stringify([member]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  await familyMemberService.list('session-a')
  assert.equal(fetchCount, 1)
  assert.deepEqual(familyMemberService.getCachedById(member.id, 'session-a'), member)
  assert.equal(familyMemberService.getCachedById(member.id, 'session-b'), undefined)
})
