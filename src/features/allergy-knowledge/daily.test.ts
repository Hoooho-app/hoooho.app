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

test('the next release is selected first for every pool size, then older articles rotate', () => {
  const release = { ...article, id: 'new-release', publishedAt: '2026-10-19' }
  for (let count = 1; count <= 7; count++) {
    const history = Array.from({ length: count }, (_, index) => ({ ...article, id: `old-${index}`, publishedAt: '2026-10-17' }))
    const expanded = [...history, release]
    const yesterday = { day: '2026-10-18', articleId: history[0].id }
    assert.notEqual(chooseDailyKnowledge(new Date(2026, 9, 19, 5, 59), expanded, yesterday)?.id, release.id)
    assert.equal(chooseDailyKnowledge(new Date(2026, 9, 19, 6), expanded, yesterday)?.id, release.id)
    assert.equal(chooseDailyKnowledge(new Date(2026, 9, 19, 23), [...expanded].reverse())?.id, release.id)
    assert.notEqual(chooseDailyKnowledge(new Date(2026, 9, 20, 6), expanded)?.id, release.id)
  }
})

test('same-edition saved content wins; draft, future, missing or withdrawn choices cannot leak', () => {
  const release = { ...article, id: 'release', publishedAt: '2026-10-19' }
  const future = { ...release, id: 'future', publishedAt: '2026-10-20' }
  const draft: KnowledgeArticle = { ...release, id: 'draft', status: 'draft' }
  const edition = new Date(2026, 9, 19, 12)
  assert.equal(chooseDailyKnowledge(edition, [article, release], { day: '2026-10-19', articleId: article.id })?.id, article.id)
  for (const id of ['draft', 'future', 'missing', 'withdrawn']) {
    assert.equal(chooseDailyKnowledge(edition, [article, release, future, draft], { day: '2026-10-19', articleId: id })?.id, release.id)
  }
  assert.equal(chooseDailyKnowledge(edition, [future, draft], { day: '2026-10-19', articleId: article.id }), null)
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  assert.equal(readDailyKnowledge('edition', new Date(2026, 9, 18, 12), storage, [article, release])?.id, article.id)
  assert.equal(readDailyKnowledge('edition', new Date(2026, 9, 19, 5, 59), storage, [article, release])?.id, article.id)
  assert.equal(readDailyKnowledge('edition', new Date(2026, 9, 19, 6), storage, [article, release])?.id, release.id)
  assert.equal(readDailyKnowledge('edition', edition, storage, [article, release, { ...release, id: 'late-addition' }])?.id, release.id)
})

test('the next scheduled edition contains complete, distinct, sourced Chinese prose', () => {
  const next = KNOWLEDGE_ARTICLES.find(item => item.id === 'eczema-observation-beyond-redness')!
  assert.equal(next.publishedAt, '2026-10-19')
  assert.equal(chooseDailyKnowledge(new Date(2026, 9, 19, 6), KNOWLEDGE_ARTICLES)?.id, next.id)
  const text = next.sections.flatMap(section => [section.title ?? '', ...section.paragraphs, ...(section.items ?? [])]).join('')
  const chinese = text.match(/\p{Script=Han}/gu)?.length ?? 0
  assert.ok(chinese >= 600 && chinese <= 900, `Chinese characters: ${chinese}`)
  assert.equal(new Set(KNOWLEDGE_ARTICLES.map(item => item.id)).size, KNOWLEDGE_ARTICLES.length)
  assert.doesNotMatch(text, /明天聊|明日预告|医生审核/)
  assert.ok(next.sources.length >= 2)
  assert.ok(next.sources.every(source => source.checkedAt === '2026-10-18' && new URL(source.url).protocol === 'https:'))
})
