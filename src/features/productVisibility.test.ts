import test from 'node:test'
import assert from 'node:assert/strict'
import { isProductPathVisible, PRODUCT_FEATURES } from '../../shared/product-visibility.mjs'
import { SUPPORT_ARTICLES, EXTRA_ARTICLES, USER_MANUAL, HELP_MODULES } from '../../shared/help-center.mjs'

test('temporary feature visibility covers nested routes, sharing and legacy entries', () => {
  assert.deepEqual(PRODUCT_FEATURES, { auxiliaryTools: false, careJourney: false, membership: false })
  for (const path of ['/care-journey', '/care-journey/themes?from=home', '/care-tools/results', '/family-sharing', '/allergy-knowledge/one', '/health-profile/vaccination/plan', '/dietary-card/edit', '/food-observations', '/food-label', '/medication-reminders?reminderId=one', '/care-handoff/shared/one', '/desensitization-tests', '/nurse-station/desensitization/new', '/account/membership']) assert.equal(isProductPathVisible(path), false, path)
  for (const path of ['/nurse-station', '/health-events', '/health-profile/allergy', '/health-profile/vaccination', '/health-profile/growth', '/visit-summary', '/recent-review', '/account/security', '/family/new', '/help']) assert.equal(isProductPathVisible(path), true, path)
})
test('help and product manager share only visible tutorials, manuals and action links', () => {
  const articles = [...SUPPORT_ARTICLES, ...EXTRA_ARTICLES]
  const ids = new Set(articles.map(article => article.id))
  for (const id of ['diet','scan','medplan']) assert.equal(ids.has(id), false)
  for (const article of articles) {
    for (const action of article.actions ?? []) assert.equal(isProductPathVisible(action.to), true)
    for (const id of article.relatedArticleIds ?? []) assert.ok(ids.has(id))
  }
  for (const manual of USER_MANUAL) assert.ok(ids.has(manual.helpArticleId))
  for (const module of HELP_MODULES) for (const id of module.articleIds) assert.ok(ids.has(id))
})
