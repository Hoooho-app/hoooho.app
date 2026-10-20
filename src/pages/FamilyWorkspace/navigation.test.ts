import test from 'node:test'
import assert from 'node:assert/strict'
import { workspaceModules, resolveLocation, locationHash, pageSections, financeDefaultView, searchWorkspace } from './navigation.ts'

test('finance has one landing page and old overview links resolve to the perspective', () => {
  const finance = workspaceModules.find(module => module.id === 'finances')!
  assert.equal(finance.pages[0].id, 'policy')
  assert.equal(finance.pages.some(page => page.id === 'overview' || page.title === '收支总览'), false)
  assert.deepEqual(resolveLocation('#finances/overview', false), { module: 'finances', page: 'perspective', section: 'overview' })
  assert.deepEqual(resolveLocation('#finances/overview/reserve', false), { module: 'finances', page: 'perspective', section: 'reserve' })
  assert.equal(locationHash(resolveLocation('#finances', false)), '#finances/policy/text')
})

test('all page and section destinations round-trip, with safe defaults and admin access boundaries', () => {
  let sectionContexts = 0
  for (const module of workspaceModules) for (const page of module.pages) {
    const resolved = resolveLocation(`#${module.id}/${page.id}`, false)
    assert.equal(resolved.module, module.id); assert.equal(resolved.page, page.id)
    const sections = pageSections(module.id, page.id)
    if (sections.length) {
      sectionContexts++
      assert.equal(resolved.section, financeDefaultView(module.id, page.id) ?? sections[0].id)
      for (const section of sections) {
        const location = { module: module.id, page: page.id, section: section.id }
        assert.deepEqual(resolveLocation(locationHash(location), false), location)
      }
      assert.equal(resolveLocation(`#${module.id}/${page.id}/unknown`, false).section, financeDefaultView(module.id, page.id) ?? sections[0].id)
    } else assert.equal(resolved.section, undefined)
  }
  assert.equal(sectionContexts, 21)
  assert.deepEqual(resolveLocation('#schedule/calendar/reserve', false), { module: 'schedule', page: 'calendar' })
  assert.deepEqual(resolveLocation('#access/overview/reserve', false), { module: 'overview', page: 'overview' })
  assert.deepEqual(resolveLocation('#access/overview/reserve', true), { module: 'access', page: 'overview' })
})

test('global search can enter exact third-level views without duplicate shared-view results', () => {
  const cash = searchWorkspace('现金储备')
  assert.equal(cash[0].module.id, 'finances'); assert.equal(cash[0].page.id, 'perspective'); assert.equal(cash[0].section?.id, 'reserve')
  assert.equal(cash.filter(item => item.section?.id === 'reserve').length, 1)
  const balance = searchWorkspace('负债表')[0]
  assert.equal(balance.section?.id, 'balance')
  assert.equal(searchWorkspace('资金目标')[0].section?.id, 'goals')
  assert.equal(searchWorkspace('预算管理')[0].page.id, 'budget')
  assert.deepEqual(searchWorkspace('   '), [])
  assert.deepEqual(searchWorkspace('确定不存在的目的地'), [])
})

test('all nine modules pin a policy first, preserve old pages and expose policy search', () => {
  for (const module of workspaceModules) {
    assert.equal(module.pages[0].id, 'policy')
    assert.equal(resolveLocation(`#${module.id}`, false).page, 'policy')
    assert.equal(module.pages.filter(page => page.id === 'policy').length, 1)
  }
  assert.equal(searchWorkspace('制度').filter(result => result.page.id === 'policy' && !result.section).length, 9)
})
