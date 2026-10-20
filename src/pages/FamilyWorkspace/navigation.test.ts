import test from 'node:test'
import assert from 'node:assert/strict'
import { workspaceModules, resolveLocation, locationHash, pageSections, financePresentation, searchWorkspace } from './navigation.ts'

test('a single finance perspective aggregates; budget, assets and insurance have their own children', () => {
  assert.equal(workspaceModules.length, 9)
  const titles = workspaceModules.flatMap(module => module.pages.flatMap(page => [page.title, ...page.sections.map(section => section.title)]))
  assert.equal(titles.filter(title => title === '财务透视表').length, 1)
  for (const obsolete of ['财务总览', '收支总览', '现金流计划', '收支报表']) assert.equal(titles.includes(obsolete), false)
  assert.deepEqual(pageSections('finances', 'perspective'), [])
  assert.deepEqual(pageSections('finances', 'budget').map(item => item.id), ['monthly', 'forecast', 'goals'])
  assert.deepEqual(pageSections('safety', 'insurance').map(item => item.id), ['policies', 'claims'])
  for (const item of pageSections('assets', 'records')) assert.equal(item.finance?.balancePart, 'assets')
  for (const item of pageSections('assets', 'liabilities')) assert.equal(item.finance?.balancePart, 'debts')
  assert.equal(financePresentation('assets', 'reserve')?.view, 'reserve')
  assert.equal(financePresentation('finances', 'budget', 'forecast')?.view, 'forecast')
  assert.equal(financePresentation('finances', 'budget', 'monthly')?.flowMode, 'budget')
  assert.equal(financePresentation('finances', 'transactions', 'actual')?.flowMode, 'actual')
  assert.equal(financePresentation('safety', 'insurance', 'claims'), undefined)
  assert.equal(financePresentation('finances', 'budget', 'overview'), undefined)
})

test('all nine modules expose meaningful own fields and safe page/section destinations', () => {
  for (const module of workspaceModules) {
    assert.ok(module.pages.length >= 4)
    assert.equal(new Set(module.pages.map(page => page.id)).size, module.pages.length)
    for (const page of module.pages) {
      const resolved = resolveLocation(`#${module.id}/${page.id}`, false)
      assert.equal(resolved.module, module.id); assert.equal(resolved.page, page.id)
      assert.equal(resolved.section, page.sections[0]?.id)
      assert.deepEqual(resolveLocation(`#${module.id}/${page.id}/unknown`, false), resolved)
      assert.equal(new Set(page.sections.map(item => item.id)).size, page.sections.length)
      for (const content of page.sections.length ? page.sections : [page]) {
        assert.ok(content.description.length)
        assert.ok(page.id === 'policy' || content.finance || content.columns.length >= 4)
        const location = { module: module.id, page: page.id, ...(page.sections.length ? { section: content.id } : {}) }
        assert.deepEqual(resolveLocation(locationHash(location), false), location)
      }
    }
  }
  assert.deepEqual(resolveLocation('#schedule/calendar/reserve', false), { module: 'schedule', page: 'calendar' })
  assert.deepEqual(resolveLocation('#access/overview/reserve', false), { module: 'overview', page: 'overview' })
  assert.deepEqual(resolveLocation('#access/overview/reserve', true), { module: 'access', page: 'overview' })
})

test('obsolete duplicates redirect to the sole maintenance location without orphaning old links', () => {
  const aliases = {
    'finances/overview': '#finances/perspective', 'finances/perspective/overview': '#finances/perspective',
    'finances/perspective/balance': '#assets/records/all', 'finances/perspective/monthly': '#finances/budget/monthly',
    'finances/perspective/reserve': '#assets/reserve', 'finances/perspective/insurance': '#safety/insurance/policies',
    'finances/perspective/goals': '#finances/budget/goals', 'finances/cashflow': '#finances/budget/forecast',
    'finances/accounts': '#assets/records/cash', 'finances/bills': '#finances/transactions/fixed',
    'finances/reports': '#finances/perspective', 'assets/overview': '#assets/records/all',
    'assets/cash': '#assets/records/cash', 'assets/holdings': '#assets/records/investment',
    'assets/property': '#assets/records/property', 'assets/equity': '#assets/records/equity',
    'assets/allocation': '#assets/investment-plans/allocation', 'assets/allocation/goals': '#finances/budget/goals',
    'assets/reports': '#finances/perspective', 'legal/trusts': '#legal/succession/trusts',
    'schedule/recurring': '#schedule/tasks/recurring', 'home/maintenance': '#home/inventory/maintenance',
    'health/elders': '#health/care/elders', 'education/community': '#education/activities/community',
    'safety/household': '#safety/checks/home', 'safety/contacts': '#safety/emergency/contacts',
    'governance/roles': '#schedule/tasks/responsibility', 'governance/decisions': '#governance/meetings/decisions'
  }
  for (const [old, target] of Object.entries(aliases)) assert.equal(locationHash(resolveLocation(`#${old}`, false)), target, old)
  assert.equal(locationHash(resolveLocation('#finances/budget/insurance', false)), '#finances/budget/monthly')
})

test('global search reaches the exact maintenance owner, including renamed categories', () => {
  const targets = { '现金储备': '#assets/reserve', '资金目标': '#finances/budget/goals', '预算管理': '#finances/budget/monthly', '公益': '#education/activities/community', '房贷': '#assets/liabilities/loans', '保姆': '#home/domestic/services' }
  for (const [query, target] of Object.entries(targets)) {
    const result = searchWorkspace(query)[0]
    assert.equal(locationHash(resolveLocation(locationHash({ module: result.module.id, page: result.page.id, section: result.section?.id }), false)), target, query)
  }
  assert.deepEqual(searchWorkspace('   '), [])
  assert.deepEqual(searchWorkspace('确定不存在的目的地'), [])
})

test('newly integrated policies remain pinned in all nine modules with their four own views', () => {
  for (const module of workspaceModules) {
    assert.equal(module.pages[0].id, 'policy')
    assert.equal(module.pages.filter(page => page.id === 'policy').length, 1)
    assert.equal(resolveLocation(`#${module.id}`, false).page, 'policy')
    assert.deepEqual(pageSections(module.id, 'policy').map(item => item.id), ['text', 'flow', 'mindmap', 'checks'])
    for (const item of pageSections(module.id, 'policy')) assert.equal(item.finance, undefined)
  }
})
