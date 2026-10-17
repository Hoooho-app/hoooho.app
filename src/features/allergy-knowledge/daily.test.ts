import assert from 'node:assert/strict'
import test from 'node:test'
import { KNOWLEDGE_ARTICLES, type KnowledgeArticle } from './articles'
import { chooseDailyKnowledge, knowledgeChoiceKey, knowledgeEditionDate, nextKnowledgeUpdate, publishedKnowledgeArticles, readDailyKnowledge } from './daily'

const now = new Date(2026, 9, 17, 12)
const article = KNOWLEDGE_ARTICLES[0]
const pool: KnowledgeArticle[] = ['a', 'b', 'c'].map(id => ({ ...article, id, publishedAt: '2026-10-01' }))

test('the local edition changes at 06:00 and calendar arithmetic survives month boundaries', () => {
  assert.equal(knowledgeEditionDate(new Date(2026, 9, 17, 5, 59)), '2026-10-16')
  assert.equal(knowledgeEditionDate(new Date(2026, 9, 17, 6)), '2026-10-17')
  assert.equal(knowledgeEditionDate(new Date(2026, 10, 1, 2)), '2026-10-31')
  assert.equal(nextKnowledgeUpdate(new Date(2026, 9, 17, 5)).getHours(), 6)
  assert.equal(nextKnowledgeUpdate(new Date(2026, 9, 17, 6)).getDate(), 18)
})

test('only published, released articles can be selected, including direct reader lookup', () => {
  const drafts: KnowledgeArticle[] = [{ ...article, status: 'draft' }, { ...article, id: 'scheduled', publishedAt: '2026-10-18' }]
  assert.deepEqual(publishedKnowledgeArticles(now, drafts), [])
  assert.equal(chooseDailyKnowledge(now, drafts), null)
  assert.equal(chooseDailyKnowledge(now, [article])?.id, article.id)
  const scheduled: KnowledgeArticle[] = [{ ...article, publishedAt: '2026-10-18' }]
  assert.deepEqual(publishedKnowledgeArticles(new Date(2026, 9, 18, 5, 59), scheduled), [])
  assert.equal(publishedKnowledgeArticles(new Date(2026, 9, 18, 6), scheduled).length, 1)
})

test('selection is stable within a day and rotates after the next local edition', () => {
  const today = chooseDailyKnowledge(now, pool)!
  assert.equal(chooseDailyKnowledge(new Date(2026, 9, 17, 23, 59), pool)?.id, today.id)
  assert.notEqual(chooseDailyKnowledge(new Date(2026, 9, 18, 6), pool)?.id, today.id)
  assert.equal(chooseDailyKnowledge(new Date(2026, 9, 18, 5, 59), pool)?.id, today.id)
})

test('a saved edition survives added or reordered content, but withdrawn content is replaced', () => {
  const previous = { day: knowledgeEditionDate(now), articleId: 'b' }
  assert.equal(chooseDailyKnowledge(now, [...pool].reverse(), previous)?.id, 'b')
  assert.equal(chooseDailyKnowledge(now, [...pool, { ...article, id: 'new' }], previous)?.id, 'b')
  assert.notEqual(chooseDailyKnowledge(now, pool.filter(item => item.id !== 'b'), previous)?.id, 'b')
})

test('corrupt or blocked storage never prevents reading and accounts have separate keys', () => {
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.ok(readDailyKnowledge('a', now, blocked, pool))
  assert.ok(readDailyKnowledge('a', now, { getItem: () => '{broken', setItem() {} }, pool))
  assert.notEqual(knowledgeChoiceKey('a'), knowledgeChoiceKey('b'))
})

test('the approved seed is complete, sourced, and has no tomorrow teaser', () => {
  const text = article.sections.flatMap(section => [...section.paragraphs, ...(section.items ?? [])]).join('')
  assert.ok(text.length >= 600)
  assert.doesNotMatch(text, /明天聊|明日预告/)
  assert.ok(article.sources.length >= 2)
  assert.ok(article.sources.every(source => new URL(source.url).protocol === 'https:'))
})
