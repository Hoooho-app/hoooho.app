import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyFinanceData } from '../../shared/family-finance.mjs'
import { forecastMonths } from '../../shared/family-finance-forecast.mjs'

const asset = (owner, amount, category = 'cash', available = true) => ({ owner, amount, category, available })
const flow = (month, kind, budget, owner = '家庭共同') => ({ month, kind, budget, actual: 999999, owner })
test('forecast rolls plans forward in cents across years, excluding transfers and unavailable assets', () => {
  const data = emptyFinanceData()
  data.assets = [asset('家庭共同', 0.1), asset('家庭共同', 0.2), asset('家庭共同', 1000, 'investment'), asset('家庭共同', 500, 'deposit', false)]
  data.flows = [flow('2026-12', 'income', 100), flow('2026-12', 'expense', 30), flow('2026-12', 'repayment', 20), flow('2026-12', 'saving', 10), flow('2026-12', 'transfer', 99999), flow('2027-01', 'expense', 10)]
  const rows = forecastMonths(data, '2026-12', '', 2)
  assert.deepEqual(rows.map(row => [row.month, row.opening, row.change, row.closing]), [['2026-12', 0.3, 40, 40.3], ['2027-01', 40.3, -10, 30.3]])
  assert.deepEqual([rows[0].income, rows[0].expenses, rows[0].principal, rows[0].savings], [100, 30, 20, 10])
})

test('missing plans break the balance chain, while explicit zero and member scopes remain meaningful', () => {
  const data = emptyFinanceData()
  data.assets = [asset('爸爸', 100), asset('妈妈', 9999)]
  data.flows = [flow('2026-10', 'expense', 0, '爸爸'), flow('2026-11', 'expense', null, '爸爸'), flow('2026-12', 'income', 50, '爸爸'), flow('2026-10', 'income', 5000, '妈妈')]
  const rows = forecastMonths(data, '2026-10', '爸爸', 3)
  assert.deepEqual(rows.map(row => [row.opening, row.change, row.closing]), [[100, 0, 100], [100, null, null], [null, 50, null]])
  assert.equal(rows[1].expenses, null)
  assert.equal(forecastMonths(data, '2026-10', '孩子', 1)[0].opening, null)
  assert.equal(forecastMonths(emptyFinanceData(), '2026-10')[0].closing, null)
})
