import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FamilyWorkspaceService } from './service.mjs'
import { emptyFinanceData, financeSummary, annualPremium, chinaDate } from '../../shared/family-finance.mjs'

const asset = overrides => ({ id: randomUUID(), name: '测试账户', category: 'cash', owner: '家庭共同', amount: 10000, valuedAt: '2026-10-20', available: true, emergency: true, note: '', ...overrides })
const flow = overrides => ({ id: randomUUID(), name: '测试项目', month: '2026-10', kind: 'expense', category: '生活', owner: '家庭共同', budget: null, actual: null, essential: false, note: '', ...overrides })
const debt = overrides => ({ id: randomUUID(), name: '测试欠款', category: 'credit', owner: '家庭共同', balance: 500, apr: null, monthlyPayment: null, creditLimit: 99999, dueDate: '', note: '', ...overrides })
const policy = overrides => ({ id: randomUUID(), name: '测试保单', category: 'medical', owner: '爸爸', insured: '孩子', insurer: '', premium: 120, frequency: 'monthly', coverage: 1000000, dueDate: '', endDate: '', status: 'active', policyNumber: '', note: '', ...overrides })
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'family-finance-'))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const options = { dataDirectory: directory, tokenSecret: 'isolated-finance-test', auth: { opsOwnerEmail: () => 'ray@example.test' }, now: () => Date.UTC(2026, 9, 20) }
  const workspace = new FamilyWorkspaceService(options)
  const admin = await workspace.createSession({ role: 'admin', name: 'Ray', email: 'ray@example.test' }, true)
  const code = await workspace.createCode(admin.raw, '家人')
  const member = await workspace.memberLogin(code.loginCode, true, 'member')
  return { workspace, admin, member, code, options }
}

test('financial arithmetic separates balances, credit, transfers, principal and saving allocations', () => {
  const data = emptyFinanceData()
  data.assets = [asset({ amount: 0.1 }), asset({ amount: 0.2 }), asset({ amount: 20000, category: 'investment', available: false, emergency: false }), asset({ amount: 5000, category: 'deposit', available: false, emergency: false })]
  data.debts = [debt({ balance: 1000, creditLimit: 80000 })]
  data.flows = [flow({ kind: 'income', actual: 10000, budget: 12000 }), flow({ actual: 2000, budget: 3000, pattern: 'fixed' }), flow({ kind: 'repayment', actual: 1000, budget: 1000 }), flow({ kind: 'saving', actual: 2000, budget: 3000 }), flow({ kind: 'transfer', actual: 999999, budget: 999999 }), flow({ month: '2026-09', actual: 10000 }), flow({ actual: null, budget: 100 })]
  data.settings = { reserveMonths: 6, essentialMonthly: 100 }
  const s = financeSummary(data, '2026-10')
  assert.equal(s.totalAssets, 25000.3); assert.equal(s.totalDebts, 1000); assert.equal(s.netAssets, 24000.3)
  assert.equal(s.liquid, 0.3); assert.equal(s.reserve, 0.3); assert.equal(s.coverageMonths, 0.003)
  assert.equal(s.fixedExpenses, 2000); assert.equal(s.variableExpenses, 0); assert.equal(s.oneoffExpenses, 0)
  assert.equal(s.income, 10000); assert.equal(s.expenses, 2000); assert.equal(s.surplus, 8000)
  assert.equal(s.disposable, 5000); assert.equal(s.plannedDisposable, 4900)
  assert.equal(s.budgetRemaining, 1100); assert.equal(s.reserveTarget, 600)
  assert.equal(s.savingsRate, 0.8); assert.equal(s.repaymentRatio, 0.1)
  assert.equal(chinaDate(Date.UTC(2026, 9, 20, 17)), '2026-10-21')
})

test('zero denominators, unrecorded actuals, member/month filters and policies keep their meanings', () => {
  const data = emptyFinanceData()
  assert.equal(financeSummary(data, '2026-10').debtRatio, null)
  assert.equal(financeSummary(data, '2026-10').savingsRate, null)
  assert.equal(financeSummary(data, '2026-10').hasActual, false)
  data.flows = [flow({ owner: '爸爸', budget: 100 }), flow({ owner: '妈妈', actual: 999 })]
  data.assets = [asset({ owner: '爸爸', amount: 100 }), asset({ owner: '妈妈', amount: 500 })]
  data.policies = [policy({ insured: '孩子', premium: 10, frequency: 'monthly' }), policy({ insured: '孩子', premium: 100, frequency: 'quarterly' }), policy({ insured: '孩子', premium: 300, frequency: 'annual' }), policy({ insured: '孩子', premium: 9000, frequency: 'once' }), policy({ insured: '孩子', premium: 999, endDate: '2025-01-01' }), policy({ insured: '孩子', premium: 999, status: 'cancelled' })]
  const s = financeSummary(data, '2026-10', '爸爸')
  assert.equal(s.totalAssets, 100); assert.equal(s.hasActual, false); assert.equal(s.hasBudget, true)
  const child = financeSummary(data, '2026-10', '孩子', '2026-10-20')
  assert.equal(child.policyCount, 4); assert.equal(child.annualPremium, 820)
  assert.equal(annualPremium(data.policies[3]), 0)
})

test('finance starts empty; admin writes persist across restart; members are read-only; revocation closes reads', async t => {
  const f = await fixture(t)
  await assert.rejects(f.workspace.finance.read(''), { status: 401 })
  const initial = await f.workspace.finance.read(f.admin.raw)
  assert.deepEqual(initial.data, emptyFinanceData()); assert.equal(initial.revision, 0)
  const data = emptyFinanceData(); data.assets.push(asset())
  await assert.rejects(f.workspace.finance.save(f.member.raw, { revision: 0, data }), { status: 403 })
  assert.equal((await f.workspace.finance.read(f.admin.raw)).revision, 0)
  const saved = await f.workspace.finance.save(f.admin.raw, { revision: 0, data })
  assert.equal(saved.revision, 1); assert.equal(saved.updatedBy, 'Ray')
  const restarted = new FamilyWorkspaceService(f.options)
  assert.deepEqual((await restarted.finance.read(f.member.raw)).data, data)
  await f.workspace.revokeCode(f.admin.raw, f.code.id)
  await assert.rejects(restarted.finance.read(f.member.raw), { status: 401 })
})

test('concurrent edits reject stale revision instead of overwriting another saved change', async t => {
  const f = await fixture(t), data = emptyFinanceData(); data.assets.push(asset())
  const attempts = await Promise.allSettled([1, 2].map(() => f.workspace.finance.save(f.admin.raw, { revision: 0, data })))
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(attempts.find(item => item.status === 'rejected').reason.status, 409)
  const latest = await f.workspace.finance.read(f.admin.raw)
  assert.equal(latest.revision, 1); assert.equal(latest.data.assets.length, 1)
})

test('server rejects malformed money, IDs, dates, emergency eligibility and empty monthly values atomically', async t => {
  const f = await fixture(t)
  const bad = []
  for (const amount of [-1, '100', 1.001, NaN, Infinity, 10000000001]) { const data = emptyFinanceData(); data.assets.push(asset({ amount })); bad.push(data) }
  for (const valuedAt of ['2026-02-30', '2026-13-01', 'bad']) { const data = emptyFinanceData(); data.assets.push(asset({ valuedAt })); bad.push(data) }
  const investment = emptyFinanceData(); investment.assets.push(asset({ category: 'investment' })); bad.push(investment)
  const locked = emptyFinanceData(); locked.assets.push(asset({ available: false, emergency: true })); bad.push(locked)
  const duplicate = emptyFinanceData(); const row = asset(); duplicate.assets.push(row, { ...row }); bad.push(duplicate)
  const missing = emptyFinanceData(); missing.flows.push(flow()); bad.push(missing)
  const unknown = emptyFinanceData(); unknown.debts.push(debt({ category: '__proto__' })); bad.push(unknown)
  const invalidMonth = emptyFinanceData(); invalidMonth.flows.push(flow({ month: '2026-99', actual: 10 })); bad.push(invalidMonth)
  const invalidSettings = emptyFinanceData(); invalidSettings.settings.reserveMonths = 1.5; bad.push(invalidSettings)
  for (const data of bad) await assert.rejects(f.workspace.finance.save(f.admin.raw, { revision: 0, data }), { status: 400 })
  assert.equal((await f.workspace.finance.read(f.admin.raw)).revision, 0)
  const data = emptyFinanceData(); data.flows.push(flow({ actual: 0, budget: null })); data.policies.push(policy()); data.debts.push(debt())
  data.goals.push({ id: randomUUID(), name: '教育', owner: '孩子', category: 'education', target: 10000, funded: 100, dueDate: '', note: '' })
  assert.equal((await f.workspace.finance.save(f.admin.raw, { revision: 0, data })).revision, 1)
})
