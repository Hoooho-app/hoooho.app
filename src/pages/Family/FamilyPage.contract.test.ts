import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const familyPageUrl = new URL('./index.tsx', import.meta.url)
const swipeRowUrl = new URL('../../components/family/FamilyMemberSwipeRow.tsx', import.meta.url)
const cardUrl = new URL('../../components/health/RecordSubjectCard.tsx', import.meta.url)

test('family list uses swipe-to-delete confirmation and the requested copy', async () => {
  const [pageSource, swipeSource, cardSource] = await Promise.all([
    readFile(familyPageUrl, 'utf8'),
    readFile(swipeRowUrl, 'utf8'),
    readFile(cardUrl, 'utf8')
  ])

  assert.doesNotMatch(pageSource, /选择家人即可查看和记录对应的健康情况/)
  assert.doesNotMatch(pageSource, />切换角色</)
  assert.doesNotMatch(pageSource, />当前角色</)
  assert.doesNotMatch(pageSource, />切换记录对象</)
  assert.match(pageSource, />当前</)
  assert.match(pageSource, />切换</)
  assert.match(pageSource, /border-text-primary[^\"]*text-text-primary/)
  assert.match(pageSource, /label=""/)
  assert.match(pageSource, /confirmLabel="确认删除"/)
  assert.match(pageSource, /await familyMemberService\.delete\(pendingDelete\.id, token\)/)
  assert.match(swipeSource, /onPointerMove/)
  assert.match(swipeSource, /ArrowLeft/)
  assert.match(swipeSource, />删除</)
  assert.match(cardSource, /\{label && <span/)
})
