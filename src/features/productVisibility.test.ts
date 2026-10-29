import test from 'node:test'
import assert from 'node:assert/strict'
import { isProductPathVisible, PRODUCT_FEATURES } from '../../shared/product-visibility.mjs'
import { SUPPORT_ARTICLES, EXTRA_ARTICLES, USER_MANUAL, HELP_MODULES } from '../../shared/help-center.mjs'

test('temporary feature visibility covers nested routes, sharing and legacy entries', () => {
  assert.deepEqual(PRODUCT_FEATURES, { auxiliaryTools: false, careJourney: false, membership: false })
  for (const path of ['/care-journey/themes?from=home', '/care-journey/exchange', '/care-journey/sprouts', '/care-tools/results', '/family-sharing', '/health-profile/vaccination/plan', '/dietary-card/edit', '/food-observations', '/food-label', '/medication-reminders?reminderId=one', '/desensitization-tests', '/nurse-station/desensitization/new', '/account/membership']) assert.equal(isProductPathVisible(path), false, path)
  for (const path of ['/care-handoff', '/care-handoff/?from=organize', '/care-handoff/shared/one', '/care-journey', '/care-journey/growth', '/care-journey/achievements', '/nurse-station', '/allergy-knowledge', '/allergy-knowledge/one', '/health-events', '/health-profile/allergy', '/health-profile/vaccination', '/health-profile/growth', '/visit-summary', '/recent-review', '/account/security', '/family/new', '/help']) assert.equal(isProductPathVisible(path), true, path)
})
test('help and product manager share only visible tutorials, manuals and action links', () => {
  const articles = [...SUPPORT_ARTICLES, ...EXTRA_ARTICLES]
  const ids = new Set(articles.map(article => article.id))
  for (const id of ['diet','scan','medplan','followup','collect','handoff','desensitization']) assert.equal(ids.has(id), false)
  assert.equal(HELP_MODULES.some(module => module.id === 'follow'), false)
  assert.doesNotMatch(JSON.stringify({ articles, USER_MANUAL, HELP_MODULES }), /看护交接|安排与跟进|任务系统|设备接入|横向对比|永久免费|永不丢失/)
  for (const article of articles) {
    for (const action of article.actions ?? []) assert.equal(isProductPathVisible(action.to), true)
    for (const id of article.relatedArticleIds ?? []) assert.ok(ids.has(id))
  }
  for (const manual of USER_MANUAL) assert.ok(ids.has(manual.helpArticleId))
  for (const module of HELP_MODULES) for (const id of module.articleIds) assert.ok(ids.has(id))
})
